"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatCurrency, formatPsf } from "@/lib/utils";

export function PsfScatterChart({
  comps,
  subject,
}: {
  comps: { name: string; sqft: number; rent: number; psf: number }[];
  subject: { name: string; sqft: number; rent: number; psf: number }[];
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E6EAF0" />
          <XAxis
            type="number"
            dataKey="sqft"
            name="Sq ft"
            tick={{ fill: "#6B7287", fontSize: 11 }}
            unit=" sf"
          />
          <YAxis
            type="number"
            dataKey="rent"
            name="Rent"
            tick={{ fill: "#6B7287", fontSize: 11 }}
            tickFormatter={(v) => `$${v}`}
            width={56}
          />
          <ZAxis type="number" dataKey="psf" range={[60, 160]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value, name) => {
              if (name === "Rent") return [formatCurrency(Number(value)), "Rent"];
              if (name === "Sq ft") return [value, "Sq ft"];
              return [formatPsf(Number(value)), "$/sq ft"];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E6EAF0",
            }}
          />
          <Scatter name="Comparables" data={comps} fill="#0B1F3A" />
          <Scatter name="Subject" data={subject} fill="#C9A227" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
