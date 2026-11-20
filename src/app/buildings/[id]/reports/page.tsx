"use client";

import { use } from "react";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";
import { ModeGate } from "@/components/live/mode-gate";
import { LivePdfReports } from "@/components/buildings/live-pdf-reports";

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export default function BuildingReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <ModeGate>
      {isUuid(id) ? (
        <LivePdfReports propertyId={id} />
      ) : (
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Invalid property"
            description="Open PDF reports from a property in your organization."
            actionLabel="Back to properties"
            onAction={() => router.push("/buildings")}
          />
        </div>
      )}
    </ModeGate>
  );
}
