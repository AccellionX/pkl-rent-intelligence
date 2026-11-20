"use client";

import { ModeGate } from "@/components/live/mode-gate";
import { LiveReportsHistory } from "@/components/live/live-reports-history";

export default function ReportsHistoryPage() {
  return (
    <ModeGate>
      <LiveReportsHistory />
    </ModeGate>
  );
}
