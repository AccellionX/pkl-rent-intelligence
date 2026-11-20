"use client";

import { ModeGate } from "@/components/live/mode-gate";
import { LiveBuildingsPage } from "@/components/live/live-buildings";

export default function BuildingsPage() {
  return (
    <ModeGate>
      <LiveBuildingsPage />
    </ModeGate>
  );
}
