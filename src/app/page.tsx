"use client";

import { ModeGate } from "@/components/live/mode-gate";
import { LiveDashboard } from "@/components/live/live-dashboard";

export default function PortfolioDashboardPage() {
  return (
    <ModeGate>
      <LiveDashboard />
    </ModeGate>
  );
}
