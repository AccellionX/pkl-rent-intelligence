"use client";

import { use } from "react";
import { Building2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { LiveComparablesReview } from "@/components/buildings/live-comparables-review";
import { useRouter } from "next/navigation";
import { ModeGate } from "@/components/live/mode-gate";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ComparablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <ModeGate>
      {UUID_RE.test(id) ? (
        <LiveComparablesPage propertyId={id} />
      ) : (
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Invalid property"
            description="Open comparables from a property in your organization."
            actionLabel="Back to properties"
            onAction={() => router.push("/buildings")}
          />
        </div>
      )}
    </ModeGate>
  );
}

function LiveComparablesPage({ propertyId }: { propertyId: string }) {
  return (
    <div>
      <Topbar
        title="Confirm comparable data"
        subtitle="Review extracted candidates, correct values, and choose match tiers"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/" },
            { label: "Properties", href: "/buildings" },
            { label: "Property", href: `/buildings/${propertyId}` },
            { label: "Comparables" },
          ]}
        />
        <GuidedReportChrome propertyId={propertyId} defaultStep="comparables" />
        <LiveComparablesReview propertyId={propertyId} />
      </div>
    </div>
  );
}
