"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navPath, setNavPath] = useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    setMobileNavOpen(false);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-surface">
        {!isLogin ? (
          <>
            <div className="hidden md:block">
              <Sidebar />
            </div>
            {mobileNavOpen ? (
              <div className="fixed inset-0 z-50 md:hidden">
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="absolute inset-0 bg-navy/50"
                  onClick={() => setMobileNavOpen(false)}
                />
                <div className="relative z-10 h-full w-[min(260px,85vw)] shadow-xl">
                  <Sidebar />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-3 text-white hover:bg-white/10"
                    onClick={() => setMobileNavOpen(false)}
                    aria-label="Close menu"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-border/70 bg-white/90 px-3 py-2 backdrop-blur md:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
                Menu
              </Button>
            </div>
          </>
        ) : null}
        <div className={isLogin ? "" : "md:pl-[260px]"}>
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
