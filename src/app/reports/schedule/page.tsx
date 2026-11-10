"use client";

import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useDemoStore } from "@/store/demo-store";
import { VETERANS_BUILDING_ID } from "@/data/veterans";
import { getBuilding } from "@/store/demo-store";
import type { ReportFrequency } from "@/data/types";
import { createId } from "@/lib/utils";
import { toast } from "sonner";

export default function SchedulePage() {
  const schedules = useDemoStore((s) => s.schedules);
  const addSchedule = useDemoStore((s) => s.addSchedule);
  const toggleSchedule = useDemoStore((s) => s.toggleSchedule);
  const removeSchedule = useDemoStore((s) => s.removeSchedule);
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
  const [email, setEmail] = useState("ria@pklmanagement.com");

  const building = getBuilding(VETERANS_BUILDING_ID);

  function createSchedule() {
    if (!building) return;
    const createdAt = new Date();
    const next = new Date(createdAt);
    next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 14));
    addSchedule({
      id: createId("sch"),
      buildingId: building.id,
      buildingName: building.name,
      frequency,
      nextRun: next.toISOString(),
      recipients: email
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
      enabled: true,
      createdAt: createdAt.toISOString(),
    });
    setOpen(false);
    toast.success("Schedule created", {
      description: "Demo only — emails are not sent.",
    });
  }

  return (
    <div>
      <Topbar
        title="Report Scheduling"
        subtitle="Simulated weekly and twice-monthly delivery cadence"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Report History", href: "/reports" },
            { label: "Scheduling" },
          ]}
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="gold">Simulated scheduling</Badge>
            <Badge variant="outline">No email delivery in demo</Badge>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold">
                <Plus className="h-4 w-4" /> New schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create report schedule</DialogTitle>
                <DialogDescription>
                  Demo schedules store locally and surface next-run dates only.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Building</Label>
                  <Input value={building?.name ?? ""} disabled className="mt-1.5" />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select
                    value={frequency}
                    onValueChange={(v) => setFrequency(v as ReportFrequency)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="twice-monthly">Twice monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recipients (comma-separated)</Label>
                  <Input
                    className="mt-1.5"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createSchedule}>Create schedule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {schedules.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No schedules yet"
            description="Create a weekly or twice-monthly cadence for the featured property."
            actionLabel="Create schedule"
            onAction={() => setOpen(true)}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {schedules.map((s) => (
              <Card key={s.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{s.buildingName}</CardTitle>
                    <CardDescription>
                      {s.frequency === "weekly" ? "Weekly" : "Twice monthly"} delivery
                    </CardDescription>
                  </div>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => {
                      toggleSchedule(s.id);
                      toast.message(s.enabled ? "Schedule paused" : "Schedule enabled");
                    }}
                  />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Next run</span>
                    <span className="font-medium text-navy">
                      {new Date(s.nextRun).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <div className="text-ink-muted">Recipients</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.recipients.map((r) => (
                        <Badge key={r} variant="secondary">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant={s.enabled ? "success" : "secondary"}>
                      {s.enabled ? "Active" : "Paused"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        removeSchedule(s.id);
                        toast.success("Schedule removed");
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How scheduling works in this demo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-muted">
            Weekly schedules mirror the listing-update cadence from the source report.
            Twice-monthly schedules represent deeper pricing refreshes. Enabling a schedule
            only updates local state — no background jobs or outbound email run in this
            Vercel-ready static demo.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
