"use client";

import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-white/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold tracking-tight text-navy">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <form
            className="relative hidden w-72 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) router.push(`/buildings?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search buildings…"
              className="pl-9"
            />
          </form>
          <Badge variant="gold" className="hidden sm:inline-flex">
            Sample data
          </Badge>
          <button
            type="button"
            className="relative rounded-md border border-border bg-white p-2 text-ink-muted hover:bg-surface-muted"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
            RD
          </div>
        </div>
      </div>
    </header>
  );
}
