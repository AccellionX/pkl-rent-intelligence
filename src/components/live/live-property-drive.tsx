"use client";

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePendingAction } from "@/hooks/use-pending-action";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import {
  driveFolderStatusSummary,
  labelDriveFolderStatus,
} from "@/lib/ui/drive-folder-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type PropertyDrive = {
  folderName: string | null;
  folderUrl: string | null;
  verifiedAt: string | null;
  accessible: boolean | null;
  accessError: string | null;
  assigned: boolean;
};

export function LivePropertyDrive({
  propertyId,
  compact = false,
}: {
  propertyId: string;
  compact?: boolean;
}) {
  const [drive, setDrive] = useState<PropertyDrive | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const { pending, run } = usePendingAction();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/drive`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not load the backup folder"));
      }
      setDrive(json.data.drive as PropertyDrive);
    } catch (err) {
      setDrive(null);
      toast.error(toUserFacingError(err, "Could not load the backup folder"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#property-drive-folder") return;
    queueMicrotask(() => {
      setExpanded(true);
      const el = document.getElementById("property-drive-folder");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loading, drive]);

  async function associate() {
    await run(async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderIdOrUrl: folderInput.trim() }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not save the backup folder"));
        }
        setDrive(json.data.drive as PropertyDrive);
        setFolderInput("");
        toast.success("Backup folder saved.");
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not save the backup folder"));
      }
    });
  }

  async function createUnderRoot() {
    await run(async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/drive/create`, {
          method: "POST",
          headers: idempotentHeaders(newIdempotencyKey()),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not create the backup folder"));
        }
        setDrive(json.data.drive as PropertyDrive);
        toast.success("Backup folder created.");
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not create the backup folder"));
      }
    });
  }

  const assigned = Boolean(drive?.assigned);
  const showEditor = !compact || expanded || !assigned;

  if (compact) {
    return (
      <div
        id="property-drive-folder"
        className="scroll-mt-24 rounded-xl border border-border bg-white px-4 py-3 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-navy">
              <FolderOpen className="h-4 w-4 shrink-0" />
              Google Drive backup
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {loading && !drive
                ? "Checking folder…"
                : `${labelDriveFolderStatus(assigned, drive?.folderName)} · ${driveFolderStatusSummary(assigned)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {drive?.folderUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={drive.folderUrl} target="_blank" rel="noreferrer">
                  Open folder
                </a>
              </Button>
            ) : null}
            {assigned ? (
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Hide" : "Change"}
              </Button>
            ) : null}
          </div>
        </div>

        {showEditor ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
            {drive?.accessError ? (
              <p className="text-xs text-rose-800">{drive.accessError}</p>
            ) : null}
            {!assigned ? (
              <Button
                size="sm"
                variant="gold"
                pending={pending}
                onClick={() => void createUnderRoot()}
              >
                Create property folder
              </Button>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="prop-drive-folder" className="text-xs">
                  {assigned ? "Replace folder link" : "Or paste an existing folder link"}
                </Label>
                <Input
                  id="prop-drive-folder"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="Paste a Google Drive folder link"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                pending={pending}
                disabled={!folderInput.trim()}
                onClick={() => void associate()}
              >
                Use this folder
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card id="property-drive-folder" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="h-4 w-4" />
          Google Drive backup
        </CardTitle>
        <CardDescription>
          Optional. Finalized PDFs can be saved here after you choose a folder. You can still
          finish and download reports without it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && !drive ? (
          <p className="text-ink-muted">Checking backup folder…</p>
        ) : (
          <>
            <div
              className={`rounded-lg border p-3 space-y-1 ${
                assigned
                  ? "border-border bg-surface-muted/40"
                  : "border-amber-200 bg-amber-50/80"
              }`}
              role="status"
            >
              <p>
                Backup folder:{" "}
                <span className="font-medium text-navy">
                  {labelDriveFolderStatus(assigned, drive?.folderName)}
                </span>
              </p>
              <p className="text-ink-muted">{driveFolderStatusSummary(assigned)}</p>
              {drive?.folderUrl ? (
                <a
                  href={drive.folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-navy underline-offset-2 hover:underline"
                >
                  Open folder
                </a>
              ) : null}
              {drive?.accessError ? (
                <p className="text-rose-800">{drive.accessError}</p>
              ) : drive?.accessible ? (
                <p className="text-ink-muted">Folder access verified</p>
              ) : null}
            </div>

            {!assigned ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="gold"
                  pending={pending}
                  onClick={() => void createUnderRoot()}
                >
                  Create property folder
                </Button>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="prop-drive-folder-full">
                {assigned ? "Replace with another folder link" : "Or paste an existing folder link"}
              </Label>
              <Input
                id="prop-drive-folder-full"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Paste a Google Drive folder link"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  pending={pending}
                  disabled={!folderInput.trim()}
                  onClick={() => void associate()}
                >
                  Use this folder
                </Button>
                {assigned ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    pending={pending}
                    onClick={() => void load()}
                  >
                    Verify access
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" pending={pending} onClick={() => void load()}>
                    Refresh status
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
