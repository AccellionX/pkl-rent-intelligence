"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeGate } from "@/components/live/mode-gate";
import { LiveDriveSettings } from "@/components/live/live-drive-settings";
import { LiveOrgSwitcher } from "@/components/live/live-org-switcher";
import { useLiveOrg } from "@/hooks/use-live-org";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function SettingsInner() {
  const router = useRouter();
  const live = useLiveOrg();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    toast.success("Signed out successfully.");
    router.push("/login");
    router.refresh();
  }

  return (
    <div>
      <Topbar title="Settings" subtitle="Account and integrations" />
      <div className="px-6 py-5">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your signed-in profile and organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {live.loading ? (
                <p className="text-ink-muted">Loading account…</p>
              ) : live.authenticated ? (
                <>
                  <p>
                    Signed in as <span className="font-medium text-navy">{live.email}</span>
                  </p>
                  {live.organizations.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      No organization access. Ask an administrator to add your account.
                    </p>
                  ) : live.organizations.length === 1 ? (
                    <p className="text-ink-muted">
                      Organization:{" "}
                      <span className="font-medium text-navy">
                        {live.organizations[0]?.name}
                      </span>
                    </p>
                  ) : (
                    <LiveOrgSwitcher
                      organizations={live.organizations}
                      organizationId={live.organizationId}
                      onChange={live.setOrganizationId}
                    />
                  )}
                  <Button variant="outline" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-ink-muted">Not signed in.</p>
                  <Button asChild variant="gold">
                    <Link href="/login">Sign in</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {live.authenticated && live.organizationId ? (
            <LiveDriveSettings organizationId={live.organizationId} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Google Drive</CardTitle>
                <CardDescription>Sign in to connect Google Drive</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Coming later</CardTitle>
              <CardDescription>Not included in this release</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-muted">
              <p>• Comparable maps in generated reports</p>
              <p>• Public owner-facing report links</p>
              <p>• DOCX export</p>
              <p>• Automatic Zillow or Apartments.com scraping</p>
              <p>• Automatic listing-photo fetch</p>
              <p>• Email scheduling</p>
              <p>• Rentometer connects by CSV/PDF upload only</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ModeGate>
      <SettingsInner />
    </ModeGate>
  );
}
