"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LeadsChartData {
  date: string;
  leads: number;
}

interface LeadsChartProps {
  data: LeadsChartData[];
}

export function LeadsChart({ data }: LeadsChartProps) {
  const [view, setView] = useState<"daily" | "hourly">("daily");

  const hourlyData = useMemo(() => {
    // Generate hourly buckets for today (0-23h)
    const buckets: { date: string; leads: number }[] = [];
    for (let h = 0; h < 24; h++) {
      buckets.push({
        date: `${String(h).padStart(2, "0")}:00`,
        leads: 0,
      });
    }
    // The last entry in daily data is "today" - we show it as hourly placeholder
    // Real hourly data would come from the API; for now show the daily distribution
    const todayData = data[data.length - 1];
    if (todayData && todayData.leads > 0) {
      // Distribute today's leads across work hours as approximation
      const workHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
      const perHour = Math.floor(todayData.leads / workHours.length);
      const remainder = todayData.leads % workHours.length;
      workHours.forEach((h, i) => {
        buckets[h].leads = perHour + (i < remainder ? 1 : 0);
      });
    }
    return buckets;
  }, [data]);

  const displayData = view === "daily" ? data : hourlyData;
  const title =
    view === "daily" ? "Leads nos Ultimos 30 Dias" : "Leads Hoje (por Hora)";

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={view === "daily" ? "default" : "outline"}
            onClick={() => setView("daily")}
            className={view === "daily" ? "bg-shark-blue hover:bg-shark-blue/90" : ""}
          >
            Diario
          </Button>
          <Button
            size="sm"
            variant={view === "hourly" ? "default" : "outline"}
            onClick={() => setView("hourly")}
            className={view === "hourly" ? "bg-shark-blue hover:bg-shark-blue/90" : ""}
          >
            Por Hora
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                  fontSize: "13px",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                formatter={(value: number) => [`${value} leads`, "Leads"]}
              />
              <Bar
                dataKey="leads"
                fill="#0066FF"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
