"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export function RentComparisonChart({
  data,
  subjectAvg,
}: {
  data: { name: string; rent: number; isSubject?: boolean }[];
  subjectAvg: number;
}) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E6EAF0" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#6B7287", fontSize: 11 }}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={70}
          />
          <YAxis
            tick={{ fill: "#6B7287", fontSize: 11 }}
            tickFormatter={(v) => `$${v}`}
            width={56}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), "Rent"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E6EAF0",
              boxShadow: "0 8px 24px rgba(11,31,58,0.08)",
            }}
          />
          <ReferenceLine
            y={subjectAvg}
            stroke="#C9A227"
            strokeDasharray="4 4"
            label={{ value: "Subject avg", fill: "#C9A227", fontSize: 11 }}
          />
          <Bar dataKey="rent" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isSubject ? "#C9A227" : "#0B1F3A"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
