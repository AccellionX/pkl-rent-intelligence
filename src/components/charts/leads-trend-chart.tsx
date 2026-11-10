"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DEMO_TREND = [
  { week: "Sep 17", zillow: 6, apartments: 4 },
  { week: "Sep 24", zillow: 8, apartments: 5 },
  { week: "Oct 1", zillow: 5, apartments: 7 },
  { week: "Oct 8", zillow: 7, apartments: 3 },
  { week: "Oct 15", zillow: 4, apartments: 5 },
];

export function LeadsTrendChart({ data = DEMO_TREND }: { data?: typeof DEMO_TREND }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="zillowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0B1F3A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0B1F3A" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="aptsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A227" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#C9A227" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E6EAF0" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: "#6B7287", fontSize: 11 }} />
          <YAxis tick={{ fill: "#6B7287", fontSize: 11 }} allowDecimals={false} width={28} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E6EAF0",
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="zillow"
            name="Zillow"
            stroke="#0B1F3A"
            fill="url(#zillowFill)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="apartments"
            name="Apartments.com"
            stroke="#C9A227"
            fill="url(#aptsFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
