"use client";

import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-store";
import { portfolioStats } from "@/data/portfolio-seed";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";

export default function SettingsPage() {
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const reports = useDemoStore((s) => s.reports);
  const schedules = useDemoStore((s) => s.schedules);
  const uploads = useDemoStore((s) => s.uploads);
  const pricingOverrides = useDemoStore((s) => s.pricingOverrides);

  return (
    <div>
      <Topbar title="Demo Settings" subtitle="Local persistence & sample-data controls" />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[{ label: "Portfolio", href: "/" }, { label: "Demo Settings" }]}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="gold">No authentication</Badge>
          <Badge variant="outline">No database</Badge>
          <Badge variant="outline">No paid APIs</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sample portfolio inventory</CardTitle>
              <CardDescription>Illustrative data generated for the demo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Buildings</span>
                <span className="font-medium">{formatNumber(portfolioStats.buildingCount)}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Units</span>
                <span className="font-medium">{formatNumber(portfolioStats.unitCount)}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Featured property</span>
                <span className="font-medium">30 Veterans Memorial Parkway</span>
              </div>
              <p className="pt-2 text-xs text-ink-muted">
                Property details, nine comps, pricing figures, and lead metrics are sourced
                from <code className="rounded bg-surface-muted px-1">references/30-veterans-pricing-report.docx</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>localStorage state</CardTitle>
              <CardDescription>Key: pkl-rent-intelligence-demo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Reports</span>
                <span className="font-medium">{reports.length}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Schedules</span>
                <span className="font-medium">{schedules.length}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Uploads</span>
                <span className="font-medium">{uploads.length}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-ink-muted">Pricing overrides</span>
                <span className="font-medium">{pricingOverrides.length}</span>
              </div>
              <Button
                className="mt-3"
                variant="destructive"
                onClick={() => {
                  resetDemo();
                  toast.success("Demo state reset");
                }}
              >
                Reset demo data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
