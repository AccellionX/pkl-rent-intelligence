"use client";

import { use } from "react";
import { ModeGate } from "@/components/live/mode-gate";
import { LiveBuildingDetail } from "@/components/live/live-building-detail";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <ModeGate>
      {UUID_RE.test(id) ? (
        <LiveBuildingDetail propertyId={id} />
      ) : (
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Invalid property"
            description="Open a property from your organization portfolio. Sample building shortcuts are not available."
            actionLabel="Back to properties"
            onAction={() => router.push("/buildings")}
          />
        </div>
      )}
    </ModeGate>
  );
}
