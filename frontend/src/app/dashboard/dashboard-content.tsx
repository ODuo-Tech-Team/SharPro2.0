"use client";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
// Mock / static data for charts
// ---------------------------------------------------------------------------

const pieData: { name: string; value: number; color: string }[] = [
  { name: "Google Ads (Palavra Chave)", value: 650, color: "#3b82f6" },
  { name: "Organico / Indicacao", value: 300, color: "#10b981" },
  { name: "Campanhas Digitais", value: 150, color: "#8b5cf6" },
];

const funnelData: {
  name: string;
  Leads: number;
  Orcamentos: number;
  Vendas: number;
}[] = [
  { name: "Jan", Leads: 400, Orcamentos: 240, Vendas: 80 },
  { name: "Fev", Leads: 300, Orcamentos: 139, Vendas: 50 },
  { name: "Mar", Leads: 500, Orcamentos: 380, Vendas: 120 },
  { name: "Abr", Leads: 280, Orcamentos: 190, Vendas: 60 },
  { name: "Mai", Leads: 590, Orcamentos: 400, Vendas: 150 },
];

const mockConversations: {
  id: number;
  cliente: string;
  origem: string;
  ai_status: string;
  interesse: string;
}[] = [
  {
    id: 1,
    cliente: "Maria Silva",
    origem: "Google Ads",
    ai_status: "active",
    interesse: "Plano Premium",
  },
  {
    id: 2,
    cliente: "Joao Santos",
    origem: "Indicacao",
    ai_status: "paused",
    interesse: "Consultoria",
  },
  {
    id: 3,
    cliente: "Ana Oliveira",
    origem: "Campanha Digital",
    ai_status: "completed",
    interesse: "Pacote Basico",
  },
  {
    id: 4,
    cliente: "Carlos Ferreira",
    origem: "Google Ads",
    ai_status: "active",
    interesse: "Plano Empresarial",
  },
  {
    id: 5,
    cliente: "Lucia Mendes",
    origem: "Organico",
    ai_status: "paused",
    interesse: "Upgrade de Plano",
  },
];

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
      return {
        label: "Ativa",
        classes:
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        Icon: Zap,
      };
    case "paused":
      return {
        label: "Pausada (Humano)",
        classes: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        Icon: Pause,
      };
    case "completed":
      return {
        label: "Finalizada (Venda)",
        classes: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        Icon: CheckCircle,
      };
    default:
      return {
        label: aiStatus,
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
  payload?: Record<string, unknown>;
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
    aiEfficiency,
    activeCount,
    chartData,
    recentSales,
  });

  // Decide whether to use real conversations or mock data
  const hasRealConversations = recentConversations.length > 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Visao Geral
          </h1>
          <p className="text-slate-400">Bem-vindo de volta, Admin.</p>
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
            Exportar Relatorio
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI Cards                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Faturamento */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-blue-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              Faturamento (IA Confirmado)
            </p>
            <div className="rounded-lg bg-blue-500/10 p-2">
              <DollarSign className="h-5 w-5 text-blue-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {formatCurrency(live.totalSalesVolume)}
          </p>
          <p className="mt-1 text-xs text-emerald-400">
            +{live.leadsTrend}% vs. semana anterior
          </p>
        </div>

        {/* Vendas Fechadas */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-emerald-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              Vendas Fechadas
            </p>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{salesCount}</p>
          <p className="mt-1 text-xs text-slate-500">8 vendas hoje</p>
        </div>

        {/* Leads Totais */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-purple-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">Leads Totais</p>
            <div className="rounded-lg bg-purple-500/10 p-2">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {live.totalLeads.toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Desde o inicio do mes
          </p>
        </div>

        {/* IA em Atendimento */}
        <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-amber-500/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              IA em Atendimento
            </p>
            <div className="rounded-lg bg-amber-500/10 p-2">
              <MessageSquare className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">
            {conversationsActiveCount}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <Activity className="h-3 w-3 animate-pulse text-amber-400" />
            <span className="text-xs text-amber-400">Ativos agora</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Charts Section                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pie Chart - Origem dos Leads */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 lg:col-span-1">
          <h2 className="mb-4 text-base font-semibold text-white">
            Origem dos Leads
          </h2>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map(
                    (entry: { name: string; value: number; color: string }) => (
                      <Cell key={entry.name} fill={entry.color} />
                    )
                  )}
                </Pie>
                <Tooltip
                  content={<DarkTooltip />}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    color: "#fff",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value: string) => (
                    <span className="text-xs text-slate-400">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart - Funil de Conversao */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Funil de Conversao: Leads vs Vendas
            </h2>
            <select className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500">
              <option>Ultimos 6 Meses</option>
              <option>Ultimos 3 Meses</option>
              <option>Este Mes</option>
            </select>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <CartesianGrid stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <Tooltip content={<DarkTooltip />} />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-slate-400">{value}</span>
                  )}
                />
                <Bar
                  dataKey="Leads"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Orcamentos"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Vendas"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Recent Conversations Table                                          */}
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Cliente
                </th>
                <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Origem
                </th>
                <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Status IA
                </th>
                <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Interesse
                </th>
                <th className="pb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {hasRealConversations
                ? recentConversations.map((conv: RecentConversation) => {
                    const badge = getStatusBadge(conv.ai_status);
                    const BadgeIcon = badge.Icon;
                    return (
                      <tr
                        key={conv.conversation_id}
                        className="transition-colors hover:bg-slate-800/30"
                      >
                        <td className="py-3 text-sm text-white">
                          Conversa #{conv.conversation_id}
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
                  })
                : mockConversations.map(
                    (conv: {
                      id: number;
                      cliente: string;
                      origem: string;
                      ai_status: string;
                      interesse: string;
                    }) => {
                      const badge = getStatusBadge(conv.ai_status);
                      const BadgeIcon = badge.Icon;
                      return (
                        <tr
                          key={conv.id}
                          className="transition-colors hover:bg-slate-800/30"
                        >
                          <td className="py-3 text-sm text-white">
                            {conv.cliente}
                          </td>
                          <td className="py-3 text-sm text-slate-400">
                            {conv.origem}
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
                            {conv.interesse}
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
                    }
                  )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
