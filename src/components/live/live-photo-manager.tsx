"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  defaultCrop3x2,
  type PhotoCropBox,
  isValidCropBox,
} from "@/lib/photos/crop";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type PhotoRow = {
  id: string;
  source: string;
  storage_path: string;
  sort_order: number;
  alt_text: string | null;
  crop_metadata: Record<string, unknown> | null;
  comparable_property_id: string | null;
  signedUrl: string | null;
};

type BatchProgressItem = {
  name: string;
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
};

type Props = {
  propertyId: string;
  /** When set, manage comparable photos; otherwise subject photos. */
  comparablePropertyId?: string | null;
};

export function LivePhotoManager({ propertyId, comparablePropertyId = null }: Props) {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgressItem[]>([]);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [cropTarget, setCropTarget] = useState<PhotoRow | null>(null);
  const [crop, setCrop] = useState<PhotoCropBox | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGen = useRef(0);
  const busyRef = useRef(false);

  function setBusyLocked(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  const scopeQs = comparablePropertyId
    ? `?comparablePropertyId=${comparablePropertyId}`
    : "";

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++requestGen.current;

      if (!opts?.silent) {
        setListLoading(true);
        setListError(null);
      }

      fetch(`/api/properties/${propertyId}/photos${scopeQs}`, { signal: controller.signal })
        .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
        .then((res) => {
          if (gen !== requestGen.current) return;
          if (!res.ok || !res.json.ok) {
            throw new Error(res.json.error?.message ?? "Failed to load photos");
          }
          const rows = (res.json.data.photos ?? []) as PhotoRow[];
          setPhotos(
            comparablePropertyId
              ? rows.filter((p) => p.comparable_property_id === comparablePropertyId)
              : rows.filter((p) => !p.comparable_property_id),
          );
          setImgFailed({});
          setListError(null);
        })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError") return;
          if (gen !== requestGen.current) return;
          const msg = toUserFacingError(err, "Could not load photos");
          setListError(msg);
          toast.error(msg);
        })
        .finally(() => {
          if (gen === requestGen.current) setListLoading(false);
        });
    },
    [propertyId, scopeQs, comparablePropertyId],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      requestGen.current += 1;
    };
  }, [load]);

  const postPhoto = useCallback(
    async (file: File, source: "upload" | "paste") => {
      const idempotencyKey = newIdempotencyKey();
      const fd = new FormData();
      fd.set("file", file);
      fd.set("source", source);
      if (comparablePropertyId) fd.set("comparablePropertyId", comparablePropertyId);
      const res = await fetch(`/api/properties/${propertyId}/photos`, {
        method: "POST",
        headers: idempotentHeaders(idempotencyKey),
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not upload photo"));
    },
    [propertyId, comparablePropertyId],
  );

  const uploadFiles = useCallback(
    async (files: File[], source: "upload" | "paste" = "upload") => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        toast.error("Select one or more image files to upload.");
        return;
      }
      if (busyRef.current) return;
      setBusyLocked(true);
      setBatchProgress(
        imageFiles.map((f) => ({
          name: f.name || "Pasted image",
          status: "pending" as const,
        })),
      );

      let succeeded = 0;
      let failed = 0;

      try {
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i]!;
          setBatchProgress((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)),
          );
          try {
            await postPhoto(file, source);
            succeeded += 1;
            setBatchProgress((prev) =>
              prev.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)),
            );
          } catch (err) {
            failed += 1;
            const msg = toUserFacingError(err, "Could not upload photo");
            setBatchProgress((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, status: "failed", error: msg } : item,
              ),
            );
          }
        }

        if (failed === 0) {
          toast.success(
            succeeded === 1
              ? "Photo added successfully."
              : `${succeeded} photos added successfully.`,
          );
        } else if (succeeded === 0) {
          toast.error(
            failed === 1 ? "Could not upload photo." : `Could not upload ${failed} photos.`,
          );
        } else {
          toast.message(
            `${succeeded} of ${succeeded + failed} photos added. ${failed} failed.`,
          );
        }

        if (succeeded > 0) load({ silent: true });
      } finally {
        setBusyLocked(false);
      }
    },
    [postPhoto, load],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length === 0) return;
      e.preventDefault();
      void uploadFiles(pasted, "paste");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  function collectImageFiles(list: FileList | File[] | null | undefined): File[] {
    if (!list) return [];
    return Array.from(list).filter((f) => f.type.startsWith("image/"));
  }

  function onDropZoneDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) setDragging(true);
  }

  function onDropZoneDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragging(false);
  }

  function onDropZoneDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const images = collectImageFiles(e.dataTransfer.files);
    if (images.length === 0) {
      toast.error("Drop image files to upload.");
      return;
    }
    void uploadFiles(images, "upload");
  }

  function openCrop(photo: PhotoRow) {
    setCropTarget(photo);
    const existing = photo.crop_metadata;
    if (isValidCropBox({ aspect: "3:2", ...existing })) {
      setCrop({ aspect: "3:2", ...existing } as PhotoCropBox);
    } else {
      setCrop(null);
    }
    setPreviewUrl(photo.signedUrl);
  }

  function onCropImageLoad() {
    const img = imgRef.current;
    if (!img || crop) return;
    setCrop(defaultCrop3x2(img.naturalWidth || 300, img.naturalHeight || 200));
  }

  async function saveCrop() {
    if (!cropTarget || !crop || busyRef.current) return;
    setBusyLocked(true);
    try {
      const res = await fetch(`/api/photos/${cropTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cropMetadata: crop }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not save crop"));
      toast.success("Changes saved.");
      setCropTarget(null);
      load({ silent: true });
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not save crop"));
    } finally {
      setBusyLocked(false);
    }
  }

  async function move(photo: PhotoRow, dir: -1 | 1) {
    const idx = photos.findIndex((p) => p.id === photo.id);
    const swap = photos[idx + dir];
    if (!swap || busyRef.current) return;
    setBusyLocked(true);
    try {
      await Promise.all([
        fetch(`/api/photos/${photo.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sortOrder: swap.sort_order }),
        }),
        fetch(`/api/photos/${swap.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sortOrder: photo.sort_order }),
        }),
      ]);
      load({ silent: true });
    } catch {
      toast.error("Unable to reorder photos. Please try again.");
    } finally {
      setBusyLocked(false);
    }
  }

  async function remove(photo: PhotoRow) {
    if (!window.confirm("Remove this photo from the property?")) return;
    if (busyRef.current) return;
    setBusyLocked(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not remove photo"));
      toast.success("Photo removed successfully.");
      load({ silent: true });
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not remove photo"));
    } finally {
      setBusyLocked(false);
    }
  }

  async function reuse(photo: PhotoRow) {
    if (busyRef.current) return;
    setBusyLocked(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos/reuse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourcePhotoId: photo.id,
          comparablePropertyId: comparablePropertyId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not reuse photo"));
      toast.success("Photo added successfully.");
      load({ silent: true });
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not reuse photo"));
    } finally {
      setBusyLocked(false);
    }
  }

  async function replace(photo: PhotoRow, file: File) {
    if (busyRef.current) return;
    setBusyLocked(true);
    try {
      await removeQuiet(photo);
      await postPhoto(file, "upload");
      toast.success("Photo added successfully.");
      load({ silent: true });
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not replace photo"));
    } finally {
      setBusyLocked(false);
    }
  }

  async function removeQuiet(photo: PhotoRow) {
    const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not replace photo"));
  }

  const title = comparablePropertyId ? "Comparable photos" : "Subject photos";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Private photos for this property. Paste from clipboard or upload; crop to 3:2 before
          reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={onDropZoneDragOver}
          onDragEnter={onDropZoneDragOver}
          onDragLeave={onDropZoneDragLeave}
          onDrop={onDropZoneDrop}
          className={`rounded-md border-2 border-dashed p-3 transition-colors ${
            dragging
              ? "border-gold bg-gold/10"
              : "border-border bg-surface/40"
          }`}
        >
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const images = collectImageFiles(e.target.files);
                if (images.length > 0) void uploadFiles(images, "upload");
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="gold"
              pending={busy}
              onClick={() => fileRef.current?.click()}
            >
              Upload photos
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load()}
              disabled={listLoading || busy}
              pending={listLoading}
            >
              Refresh photos
            </Button>
            <span className="self-center text-xs text-ink-muted">
              Drop images here, or paste (⌘/Ctrl+V) while this page is focused
            </span>
          </div>

          {batchProgress.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-ink-muted" aria-live="polite">
              {batchProgress.map((item, idx) => (
                <li key={`${item.name}-${idx}`} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-ink">{item.name}</span>
                  <span>
                    {item.status === "pending"
                      ? "Waiting…"
                      : item.status === "uploading"
                        ? "Uploading…"
                        : item.status === "done"
                          ? "Added"
                          : item.error ?? "Failed"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {listError ? (
          <div className="rounded-md border border-border bg-surface/50 p-3 text-sm">
            <p className="text-ink-muted">{listError}</p>
            <Button className="mt-2" size="sm" variant="outline" onClick={() => load()}>
              Try again
            </Button>
          </div>
        ) : null}

        {listLoading && photos.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-md border border-border bg-surface-muted/60"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-surface/50 text-sm text-ink-muted">
            Photo to be added
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className="overflow-hidden rounded-md border border-border bg-white"
              >
                <div className="relative aspect-[3/2] bg-surface">
                  {p.signedUrl && !imgFailed[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.signedUrl}
                      alt={p.alt_text ?? "Property photo"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={() =>
                        setImgFailed((prev) => ({
                          ...prev,
                          [p.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-ink-muted">
                      <span>
                        {p.signedUrl
                          ? "Preview expired or unavailable"
                          : "Preview unavailable"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => load({ silent: true })}
                      >
                        Reload preview
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-2 text-xs text-ink-muted">
                  <div>
                    #{i + 1} · {p.source}
                    {isValidCropBox({ aspect: "3:2", ...(p.crop_metadata ?? {}) })
                      ? " · cropped 3:2"
                      : ""}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || i === 0}
                      onClick={() => void move(p, -1)}
                    >
                      Up
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || i === photos.length - 1}
                      onClick={() => void move(p, 1)}
                    >
                      Down
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !p.signedUrl || Boolean(imgFailed[p.id])}
                      onClick={() => openCrop(p)}
                    >
                      Crop
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void reuse(p)}
                    >
                      Reuse
                    </Button>
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void replace(p, f);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-2 text-xs hover:bg-surface">
                        Replace
                      </span>
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void remove(p)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {cropTarget && previewUrl ? (
          <div className="rounded-md border border-border p-3">
            <Label className="text-xs">3:2 crop preview</Label>
            <p className="mb-2 text-xs text-ink-muted">
              Adjust the crop window (fractions of the image). Preview uses aspect 3:2.
            </p>
            <div className="relative mx-auto max-w-lg overflow-hidden rounded border border-border bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Crop source"
                className="block w-full"
                onLoad={onCropImageLoad}
              />
              {crop ? (
                <div
                  className="pointer-events-none absolute border-2 border-gold bg-gold/10"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />
              ) : null}
            </div>
            {crop ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {(
                  [
                    ["x", crop.x],
                    ["y", crop.y],
                    ["width", crop.width],
                    ["height", crop.height],
                  ] as const
                ).map(([key, val]) => (
                  <div key={key}>
                    <Label className="text-xs">{key}</Label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={val}
                      className="w-full"
                      onChange={(e) => {
                        const next = { ...crop, [key]: Number(e.target.value) };
                        if (key === "width") {
                          next.height = Math.min(1 - next.y, next.width / (3 / 2));
                        }
                        if (key === "height") {
                          next.width = Math.min(1 - next.x, next.height * (3 / 2));
                        }
                        if (key === "x") {
                          next.width = Math.min(next.width, 1 - next.x);
                          next.height = next.width / (3 / 2);
                          if (next.y + next.height > 1) next.y = 1 - next.height;
                        }
                        if (key === "y") {
                          next.height = Math.min(next.height, 1 - next.y);
                          next.width = next.height * (3 / 2);
                          if (next.x + next.width > 1) next.x = 1 - next.width;
                        }
                        setCrop(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="gold" disabled={busy || !crop} onClick={() => void saveCrop()}>
                Save crop
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setCropTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
