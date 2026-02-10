"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  description?: string;
  trend?: number;
  icon: LucideIcon;
  iconColor?: string;
}

export function KpiCard({
  title,
  value,
  description,
  trend,
  icon: Icon,
  iconColor = "text-shark-blue",
}: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {(description || trend !== undefined) && (
              <div className="flex items-center gap-1 text-xs">
                {trend !== undefined && (
                  <>
                    {trend >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        trend >= 0 ? "text-emerald-500" : "text-red-500"
                      )}
                    >
                      {trend > 0 ? "+" : ""}
                      {trend}%
                    </span>
                  </>
                )}
                {description && (
                  <span className="text-muted-foreground">{description}</span>
                )}
              </div>
            )}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10",
              iconColor
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
