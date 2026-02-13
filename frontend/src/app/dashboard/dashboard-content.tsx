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
import {
  Users,
  DollarSign,
  TrendingUp,
  Filter,
  Download,
  Activity,
  MessageSquare,
  Zap,
  Pause,
  CheckCircle,
  MoreHorizontal,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useRealtimeDashboard } from "@/hooks/use-realtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentConversation {
  conversation_id: number;
  ai_status: string;
  status: string;
  updated_at: string;
}

interface DashboardContentProps {
  orgId: string;
  isSuperAdmin?: boolean;
  totalLeads: number;
  leadsTrend: number;
  totalSalesVolume: number;
  salesCount: number;
  aiEfficiency: number;
  activeCount: number;
  conversationsActiveCount: number;
  conversationsPausedCount: number;
  chartData: { date: string; leads: number }[];
  recentSales: {
    id: string;
    amount: number;
    source: string;
    created_at: string;
  }[];
  recentConversations: RecentConversation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusBadge(aiStatus: string): {
  label: string;
  classes: string;
  Icon: typeof Zap;
} {
  switch (aiStatus) {
    case "active":
    case "bot":
      return {
        label: "IA Ativa",
        classes:
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        Icon: Zap,
      };
    case "paused":
    case "human":
      return {
        label: "Humano",
        classes: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        Icon: Pause,
      };
    case "completed":
    case "resolved":
      return {
        label: "Finalizada",
        classes: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        Icon: CheckCircle,
      };
    default:
      return {
        label: aiStatus || "—",
        classes: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
        Icon: Activity,
      };
  }
}

// ---------------------------------------------------------------------------
// Custom Tooltip for charts
// ---------------------------------------------------------------------------

interface ChartTooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
}

function DarkTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm shadow-xl">
      {label && <p className="mb-1 font-medium text-white">{label}</p>}
      {payload.map((entry: ChartTooltipPayloadItem) => (
        <p key={entry.name} style={{ color: entry.color }} className="text-xs">
          {entry.name}: {entry.value.toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardContent({
  orgId,
  isSuperAdmin,
  totalLeads,
  leadsTrend,
  totalSalesVolume,
  salesCount,
  aiEfficiency,
  activeCount,
  conversationsActiveCount,
  conversationsPausedCount,
  chartData,
  recentSales,
  recentConversations,
}: DashboardContentProps) {
  const live = useRealtimeDashboard(orgId, {
    totalLeads,
    leadsTrend,
    totalSalesVolume,
    salesCount,
    aiEfficiency,
    activeCount,
    conversationsActiveCount,
    conversationsPausedCount,
    chartData,
    recentSales,
    recentConversations,
  });

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Visão Geral
          </h1>
          <p className="text-slate-400">
            {isSuperAdmin
              ? "Acompanhe seus prospects, reuniões e atendimentos da IA."
              : "Acompanhe seus atendimentos e métricas."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <Filter className="h-4 w-4" />
            Filtros
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Download className="h-4 w-4" />
            Exportar Relatório
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI Cards                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Faturamento / Reunioes Agendadas */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-blue-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              {isSuperAdmin ? "Reuniões Agendadas" : "Faturamento (IA)"}
            </p>
            <div className="rounded-lg bg-blue-500/10 p-2">
              <DollarSign className="h-5 w-5 text-blue-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {isSuperAdmin ? live.salesCount : formatCurrency(live.totalSalesVolume)}
          </p>
          <p className="mt-1 text-xs text-emerald-400">
            {isSuperAdmin
              ? "Total registrado"
              : `${live.leadsTrend >= 0 ? "+" : ""}${live.leadsTrend}% vs. semana anterior`}
          </p>
        </div>

        {/* Vendas Fechadas / Reunioes Realizadas */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-emerald-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              {isSuperAdmin ? "Reuniões Realizadas" : "Vendas Fechadas"}
            </p>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{live.salesCount}</p>
          <p className="mt-1 text-xs text-slate-500">Total registrado</p>
        </div>

        {/* Leads Totais */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-purple-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              {isSuperAdmin ? "Prospects Totais" : "Leads Totais"}
            </p>
            <div className="rounded-lg bg-purple-500/10 p-2">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {live.totalLeads.toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Desde o início do mês
          </p>
        </div>

        {/* IA em Atendimento */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-amber-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              {isSuperAdmin ? "IA Prospectando" : "IA em Atendimento"}
            </p>
            <div className="rounded-lg bg-amber-500/10 p-2">
              <MessageSquare className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {live.conversationsActiveCount}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            {live.conversationsActiveCount > 0 && (
              <Activity className="h-3 w-3 animate-pulse text-amber-400" />
            )}
            <span className="text-xs text-amber-400">
              {live.conversationsActiveCount > 0 ? "Ativos agora" : "Nenhum ativo"}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Chart: Leads por Dia (ultimos 30 dias) - dados reais               */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-semibold text-white">
          {isSuperAdmin ? "Prospects por Dia (últimos 30 dias)" : "Leads por Dia (últimos 30 dias)"}
        </h2>
        {live.chartData.some((d: { date: string; leads: number }) => d.leads > 0) ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={live.chartData}>
                <CartesianGrid stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip content={<DarkTooltip />} />
                <Bar
                  dataKey="leads"
                  name="Leads"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-slate-500">
              {isSuperAdmin ? "Nenhum prospect registrado nos últimos 30 dias." : "Nenhum lead registrado nos últimos 30 dias."}
            </p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Recent Conversations Table (dados reais)                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Atendimentos Recentes
          </h2>
          <a
            href="/dashboard/conversations"
            className="text-sm text-blue-400 transition-colors hover:text-blue-300"
          >
            Ver todos
          </a>
        </div>

        {live.recentConversations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Conversa
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Canal
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Status IA
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {live.recentConversations.map((conv: RecentConversation) => {
                  const badge = getStatusBadge(conv.ai_status);
                  const BadgeIcon = badge.Icon;
                  return (
                    <tr
                      key={conv.conversation_id}
                      className="transition-colors hover:bg-slate-800/30"
                    >
                      <td className="py-3 text-sm text-white">
                        #{conv.conversation_id}
                      </td>
                      <td className="py-3 text-sm text-slate-400">
                        WhatsApp
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.classes}`}
                        >
                          <BadgeIcon className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-slate-400">
                        {conv.status}
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center">
            <p className="text-sm text-slate-500">Nenhum atendimento registrado ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
