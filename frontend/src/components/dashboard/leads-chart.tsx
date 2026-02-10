"use client";

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

interface LeadsChartData {
  date: string;
  leads: number;
}

interface LeadsChartProps {
  data: LeadsChartData[];
}

export function LeadsChart({ data }: LeadsChartProps) {
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Leads nos Ultimos 30 Dias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
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
