"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ModeGate } from "@/components/live/mode-gate";

export default function SchedulePage() {
  const router = useRouter();
  return (
    <ModeGate>
      <div>
        <Topbar title="Scheduling" subtitle="Coming later" />
        <div className="px-6 py-5">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/" },
              { label: "Report History", href: "/reports" },
              { label: "Scheduling" },
            ]}
          />
          <EmptyState
            icon={Calendar}
            title="Email scheduling isn’t available yet"
            description="Generate and download PDFs from each property’s report workspace. Scheduled owner emails will be added later."
            actionLabel="Report history"
            onAction={() => router.push("/reports")}
          />
          <div className="mt-3 text-center">
            <Button asChild variant="outline" size="sm">
              <Link href="/reports">Open report history</Link>
            </Button>
          </div>
        </div>
      </div>
    </ModeGate>
  );
}
