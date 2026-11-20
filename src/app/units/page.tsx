"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ModeGate } from "@/components/live/mode-gate";

export default function UnitsPage() {
  const router = useRouter();
  return (
    <ModeGate>
      <div>
        <Topbar title="Units" subtitle="Managed on each property" />
        <div className="px-6 py-5">
          <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Units" }]} />
          <EmptyState
            icon={Building2}
            title="Open a property to manage units"
            description="Subject units and unit types are managed on each property workspace."
            actionLabel="Go to properties"
            onAction={() => router.push("/buildings")}
          />
          <div className="mt-3 text-center">
            <Button asChild variant="outline" size="sm">
              <Link href="/buildings">Properties</Link>
            </Button>
          </div>
        </div>
      </div>
    </ModeGate>
  );
}
