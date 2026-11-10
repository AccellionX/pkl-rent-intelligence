"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarClock,
  FileText,
  LayoutDashboard,
  LineChart,
  Settings2,
  Upload,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VETERANS_BUILDING_ID } from "@/data/veterans";

const nav = [
  { href: "/", label: "Portfolio", icon: LayoutDashboard },
  { href: "/buildings", label: "Buildings", icon: Building2 },
  { href: "/units", label: "Units", icon: Home },
  {
    href: `/buildings/${VETERANS_BUILDING_ID}`,
    label: "30 Veterans",
    icon: LineChart,
  },
  { href: "/reports", label: "Report History", icon: FileText },
  { href: "/reports/schedule", label: "Scheduling", icon: CalendarClock },
  { href: "/upload", label: "AI Upload", icon: Upload },
  { href: "/settings", label: "Demo Settings", icon: Settings2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/10 bg-navy text-white">
      <div className="relative overflow-hidden border-b border-white/10 px-5 py-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold/20 blur-2xl" />
        <Link href="/" className="relative block">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
            PKL Management LLC
          </div>
          <div className="mt-1 font-display text-xl font-semibold tracking-tight">
            Rent Intelligence
          </div>
        </Link>
        <p className="mt-2 text-xs text-white/55">Portfolio pricing & leasing intel</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-white/65 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-gold" : "text-white/45 group-hover:text-gold/80",
                )}
              />
              <span className="font-medium">{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-gold/90">Demo mode</div>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Sample portfolio data with live local edits. No paid APIs connected.
          </p>
        </div>
      </div>
    </aside>
  );
}
