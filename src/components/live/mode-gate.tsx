"use client";

import type { ReactNode } from "react";
import { ConfigurationRequired } from "@/components/live/configuration-required";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useAppModeDetails } from "@/hooks/use-app-mode";

/**
 * Customer-facing pages render when the app is configured.
 * Never mounts sample/demo portfolio components.
 */
export function ModeGate({ children }: { children: ReactNode }) {
  const details = useAppModeDetails();

  if (details.mode === "unknown") {
    return <PageSkeleton rows={3} />;
  }

  if (details.mode === "unconfigured" || details.mode === "demo") {
    return (
      <div className="px-6 py-10">
        <ConfigurationRequired
          message="Rent Intelligence isn’t available right now. Please contact your administrator."
        />
      </div>
    );
  }

  return <>{children}</>;
}
