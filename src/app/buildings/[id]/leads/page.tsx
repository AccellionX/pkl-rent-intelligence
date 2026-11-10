"use client";

import { use } from "react";
import Link from "next/link";
import { Building2, Phone, Mail, MousePointerClick, Eye } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PropertyNav } from "@/components/buildings/property-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadsTrendChart } from "@/components/charts/leads-trend-chart";
import { getBuilding } from "@/store/demo-store";
import { veteransLeads, VETERANS_BUILDING_ID } from "@/data/veterans";
import { formatNumber, formatPercent } from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function LeadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const building = getBuilding(id);
  const leads = veteransLeads;

  if (!building || id !== VETERANS_BUILDING_ID) {
    return (
      <div>
        <Topbar title="Lead analytics" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Lead analytics demo is on 30 Veterans"
            description="Weekly Zillow and Apartments.com metrics from the source report."
            actionLabel="Open lead analytics"
            onAction={() => {
              router.push(`/buildings/${VETERANS_BUILDING_ID}/leads`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Lead Analytics"
        subtitle={`Weekly listing update — ${leads.weekLabel}`}
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: building.name, href: `/buildings/${id}` },
            { label: "Leads" },
          ]}
        />
        <PropertyNav buildingId={id} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="gold">Sample listing metrics</Badge>
          <Badge variant="outline">Not a live Zillow / Apartments.com integration</Badge>
        </div>

        <p className="mb-5 max-w-3xl text-sm text-ink-muted">
          Nine leads this week across both platforms (4 Zillow, 5 Apartments.com), with all
          three available units still active. Zillow views converted to leads at{" "}
          {formatPercent(leads.conversionRateWeek)} this week, down from the listing-to-date
          rate of {formatPercent(leads.conversionRateToDate)}.
        </p>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Zillow leads (week)"
            value={String(leads.zillow.totalLeads.week)}
            hint={`${formatNumber(leads.zillow.totalLeads.toDate)} to date`}
            icon={MousePointerClick}
          />
          <StatCard
            label="Zillow views (week)"
            value={formatNumber(leads.zillow.listingViews.week)}
            hint={`${formatNumber(leads.zillow.impressions.week)} impressions`}
            icon={Eye}
          />
          <StatCard
            label="Apts.com phone"
            value={String(leads.apartments.phoneCalls)}
            hint={`${leads.apartments.emails} emails`}
            icon={Phone}
          />
          <StatCard
            label="Tours scheduled"
            value={String(leads.toursScheduled)}
            hint={`${leads.toursCompleted} completed · ${leads.applicationsReceived} apps`}
            icon={Mail}
          />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Lead trend (illustrative)</CardTitle>
              <CardDescription>
                Weekly totals for demo charting — trailing weeks are simulated around the
                reported Oct 15–22 snapshot
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeadsTrendChart />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pipeline this week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Tours scheduled</span>
                <span className="font-semibold">{leads.toursScheduled}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Tours completed</span>
                <span className="font-semibold">{leads.toursCompleted}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Applications</span>
                <span className="font-semibold">{leads.applicationsReceived}</span>
              </div>
              <p className="text-xs text-ink-muted">
                One Apartments.com prospect requested a tour; scheduling for early next week.
                No prospect feedback yet.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/buildings/${id}/reports`}>Attach to pricing report</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="zillow">
          <TabsList>
            <TabsTrigger value="zillow">Zillow Rental Manager</TabsTrigger>
            <TabsTrigger value="apartments">Apartments.com</TabsTrigger>
          </TabsList>
          <TabsContent value="zillow">
            <Card>
              <CardHeader>
                <CardTitle>Zillow Premium listing metrics</CardTitle>
                <CardDescription>This week vs listing to date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-subtle">
                      <tr>
                        <th className="pb-2 font-medium">Metric</th>
                        <th className="pb-2 font-medium">This week</th>
                        <th className="pb-2 font-medium">Listing to date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Impressions", leads.zillow.impressions],
                          ["Listing views", leads.zillow.listingViews],
                          ["Web referrals", leads.zillow.webReferrals],
                          ["Total leads", leads.zillow.totalLeads],
                          ["Phone leads", leads.zillow.phoneLeads],
                          ["Email leads", leads.zillow.emailLeads],
                          ["Ad impressions", leads.zillow.adImpressions],
                          ["Ad clicks", leads.zillow.adClicks],
                        ] as const
                      ).map(([label, values]) => (
                        <tr key={label} className="border-b border-border/60 last:border-0">
                          <td className="py-2.5 font-medium text-navy">{label}</td>
                          <td className="py-2.5">{formatNumber(values.week)}</td>
                          <td className="py-2.5">{formatNumber(values.toDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="apartments">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Call log</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {leads.apartments.callLog.map((c) => (
                    <div
                      key={c.datetime}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span>{c.datetime}</span>
                      <Badge variant="secondary">{c.duration}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Email inquiries</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {leads.apartments.emailInquiries.map((e) => (
                    <div key={e.date} className="rounded-lg border border-border px-3 py-2">
                      <div className="text-xs font-medium text-gold">{e.date}</div>
                      <p className="mt-1 text-sm text-ink-muted">{e.note}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
