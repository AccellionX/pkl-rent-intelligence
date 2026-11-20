"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LiveOrgSwitcher } from "@/components/live/live-org-switcher";
import { useLiveOrg } from "@/hooks/use-live-org";
import { toUserFacingError } from "@/lib/ui/user-facing-error";

export function LiveAuthGate({
  children,
  title = "Sign in required",
  showOrgSwitcher = true,
}: {
  children: (ctx: ReturnType<typeof useLiveOrg>) => React.ReactNode;
  title?: string;
  showOrgSwitcher?: boolean;
}) {
  const ctx = useLiveOrg();
  const router = useRouter();

  if (ctx.loading) {
    return (
      <div className="px-6 py-10 text-sm text-ink-muted">Checking your account…</div>
    );
  }

  if (!ctx.authenticated) {
    return (
      <div className="px-6 py-5">
        <EmptyState
          icon={Lock}
          title={title}
          description="Sign in to continue. Your organization data is only available after you sign in."
          actionLabel="Go to sign in"
          onAction={() => router.push("/login")}
        />
        <div className="mt-3 text-center">
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (ctx.organizations.length === 0) {
    return (
      <div className="px-6 py-10 text-sm text-ink-muted">
        {ctx.error
          ? toUserFacingError(
              ctx.error,
              "No organization access for this account. Ask an administrator to add you.",
            )
          : "No organization access for this account. Ask an administrator to add you."}
      </div>
    );
  }

  if (!ctx.organizationId) {
    return (
      <div className="px-6 py-10 text-sm text-ink-muted">
        {ctx.error
          ? toUserFacingError(ctx.error, "Select an organization to continue.")
          : "Select an organization to continue."}
      </div>
    );
  }

  return (
    <>
      {showOrgSwitcher && ctx.organizations.length > 1 ? (
        <div className="border-b border-border/70 bg-white/80 px-6 py-3">
          <LiveOrgSwitcher
            organizations={ctx.organizations}
            organizationId={ctx.organizationId}
            onChange={ctx.setOrganizationId}
          />
        </div>
      ) : null}
      {children(ctx)}
    </>
  );
}
