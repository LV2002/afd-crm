"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDateIST } from "@/lib/format/date";

export interface DayPoint {
  date: string;
  sent: number;
  /** Rupees, already converted for the axis. */
  rupees: number;
}

const day = (date: string) => formatDateIST(new Date(`${date}T06:00:00Z`), "d MMM");

/** Two charts, one measure each: messages and rupees run on different scales, and sharing an axis would flatten one of them. */
export function AutomationChart({ points }: { points: DayPoint[] }) {
  const data = points.map((p) => ({ ...p, label: day(p.date) }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <figure className="m-0 flex flex-col gap-1">
        <figcaption className="text-sm font-medium">Messages sent per day</figcaption>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [value, "Messages"]} />
              <Bar dataKey="sent" fill="#25d366" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="m-0 flex flex-col gap-1">
        <figcaption className="text-sm font-medium">Cost per day (₹)</figcaption>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Cost"]} />
              <Area type="monotone" dataKey="rupees" stroke="#128c7e" fill="#128c7e33" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
