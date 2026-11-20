"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
        </div>
      </div>
    </header>
  );
}
