"use client";

import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePendingAction } from "@/hooks/use-pending-action";
import { labelDriveConnection } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type DriveStatus = {
  configured: boolean;
  connectedAccount: string | null;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
  connectionError: string | null;
  checkedAt: string | null;
  migrationReady: boolean;
  hasRootFolder: boolean;
};

export function LiveDriveSettings({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [loading, setLoading] = useState(true);
  const { pending, run } = usePendingAction();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/drive/status?organizationId=${organizationId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not load Google Drive settings"));
      }
      setStatus(json.data.drive as DriveStatus);
    } catch (err) {
      setStatus(null);
      toast.error(toUserFacingError(err, "Could not load Google Drive settings"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when org changes
  }, [organizationId]);

  async function saveRoot() {
    await run(async () => {
      try {
        const res = await fetch("/api/drive/root", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            folderIdOrUrl: folderInput.trim(),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not save the report folder"));
        }
        setStatus(json.data.drive as DriveStatus);
        setFolderInput("");
        toast.success("Saved successfully.");
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not save the report folder"));
      }
    });
  }

  async function createRoot() {
    await run(async () => {
      try {
        const res = await fetch("/api/drive/root", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            create: true,
            folderName: "PKL DEV Reports",
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not create the report folder"));
        }
        setStatus(json.data.drive as DriveStatus);
        toast.success("Reports root folder ready.");
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not create the report folder"));
      }
    });
  }

  async function refresh() {
    await run(async () => {
      await load();
      toast.success("Google Drive connection refreshed.");
    });
  }

  const connectionLabel = status?.configured
    ? status.connectionError
      ? labelDriveConnection("error")
      : labelDriveConnection("connected")
    : labelDriveConnection("not_connected");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4" />
          Google Drive
        </CardTitle>
        <CardDescription>
          Save finalized PDF reports to your organization’s Google Drive folders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading && !status ? (
          <p className="text-ink-muted">Checking Google Drive…</p>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-surface-muted/40 p-3 space-y-1">
              <p>
                Status: <span className="font-medium text-navy">{connectionLabel}</span>
              </p>
              {status?.connectedAccount ? (
                <p className="text-ink-muted">Connected account: {status.connectedAccount}</p>
              ) : null}
              <p>
                Report folder:{" "}
                <span className="font-medium text-navy">
                  {status?.rootFolderName ?? (status?.hasRootFolder ? "Selected" : "Not selected")}
                </span>
              </p>
              {status?.rootFolderUrl ? (
                <a
                  href={status.rootFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy underline-offset-2 hover:underline"
                >
                  Open folder in Google Drive
                </a>
              ) : null}
              {status?.connectionError ? (
                <p className="text-rose-800" role="status">
                  {toUserFacingError(status.connectionError, status.connectionError)}
                </p>
              ) : null}
              {!status?.migrationReady ? (
                <p className="text-amber-800">
                  Google Drive folder settings aren’t ready yet. Please contact your administrator.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-root">Select report folder</Label>
              <Input
                id="drive-root"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Paste a Google Drive folder link"
                disabled={!status?.migrationReady}
              />
              <p className="text-xs text-ink-muted">
                Prefer Create reports root folder so PKL can access it with the connected
                Google account. Pasted folders only work if this app already created them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="gold"
                  size="sm"
                  pending={pending}
                  disabled={!status?.migrationReady || !status?.configured}
                  onClick={() => void createRoot()}
                >
                  {status?.hasRootFolder ? "Recreate / reuse reports root" : "Create reports root folder"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  pending={pending}
                  disabled={!folderInput.trim() || !status?.migrationReady}
                  onClick={() => void saveRoot()}
                >
                  {status?.hasRootFolder ? "Update from link" : "Use pasted folder link"}
                </Button>
                <Button variant="outline" size="sm" pending={pending} onClick={() => void refresh()}>
                  Refresh connection
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
