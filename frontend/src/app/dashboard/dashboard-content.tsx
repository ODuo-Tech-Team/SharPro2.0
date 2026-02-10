"use client";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { LeadsChart } from "@/components/dashboard/leads-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, DollarSign, Brain, MessageSquare } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface DashboardContentProps {
  totalLeads: number;
  leadsTrend: number;
  totalSalesVolume: number;
  aiEfficiency: number;
  activeCount: number;
  chartData: { date: string; leads: number }[];
  recentSales: {
    id: string;
    amount: number;
    source: string;
    created_at: string;
  }[];
}

export function DashboardContent({
  totalLeads,
  leadsTrend,
  totalSalesVolume,
  aiEfficiency,
  activeCount,
  chartData,
  recentSales,
}: DashboardContentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visao geral da sua operacao de atendimento.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de Leads"
          value={totalLeads.toLocaleString("pt-BR")}
          trend={leadsTrend}
          description="vs. semana anterior"
          icon={Users}
          iconColor="text-shark-blue"
        />
        <KpiCard
          title="Volume de Vendas"
          value={formatCurrency(totalSalesVolume)}
          icon={DollarSign}
          iconColor="text-emerald-500"
        />
        <KpiCard
          title="Eficiencia da IA"
          value={`${aiEfficiency}%`}
          description="vendas via IA"
          icon={Brain}
          iconColor="text-purple-500"
        />
        <KpiCard
          title="Conversas Ativas"
          value={activeCount.toLocaleString("pt-BR")}
          icon={MessageSquare}
          iconColor="text-shark-accent"
        />
      </div>

      {/* Chart */}
      <LeadsChart data={chartData} />

      {/* Recent Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Vendas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentSales.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma venda registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">
                      {formatDate(sale.created_at)}
                    </TableCell>
                    <TableCell>{formatCurrency(sale.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sale.source === "ai" ? "info" : "secondary"
                        }
                      >
                        {sale.source === "ai" ? "IA" : "Humano"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
