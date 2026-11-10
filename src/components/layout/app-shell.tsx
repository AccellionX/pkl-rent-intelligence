"use client";

import { Sidebar } from "./sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { useDemoStore } from "@/store/demo-store";
import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const setHydrated = useDemoStore((s) => s.setHydrated);
  const hydrated = useDemoStore((s) => s.hydrated);

  useEffect(() => {
    // Ensure hydration flag flips even if persist callback races
    if (!hydrated) {
      const t = setTimeout(() => setHydrated(true), 50);
      return () => clearTimeout(t);
    }
  }, [hydrated, setHydrated]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-surface">
        <Sidebar />
        <div className="pl-[260px]">
          <main className="min-h-screen animate-fade-in">{children}</main>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast: "border border-border bg-white text-navy shadow-lg",
              title: "text-navy font-medium",
              description: "text-ink-muted",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
