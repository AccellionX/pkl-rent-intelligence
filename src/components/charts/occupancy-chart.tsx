"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function OccupancyChart({
  occupied,
  vacant,
}: {
  occupied: number;
  vacant: number;
}) {
  const data = [
    { name: "Occupied", value: occupied },
    { name: "Vacant", value: vacant },
  ];
  const colors = ["#0B1F3A", "#C9A227"];

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
