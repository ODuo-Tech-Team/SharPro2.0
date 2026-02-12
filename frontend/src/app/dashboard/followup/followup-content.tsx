"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Bot,
  ArrowRightLeft,
  FileText,
  CheckCircle2,
  Search,
  Phone,
  Clock,
  Star,
  Tag,
  DollarSign,
  MessageSquareText,
} from "lucide-react";
import { useRealtimeLeads } from "@/hooks/use-realtime";

// ── Types ──────────────────────────────────────────────────────

type PipelineStatus =
  | "ia_atendendo"
  | "qualificado"
  | "transferido"
  | "orcamento_enviado"
  | "venda_confirmada"
  | "perdido";

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  conversion_value: number | null;
  lead_score: number;
  interest_tags: string[];
  origin: string;
  created_at: string;
  pipeline_status: string;
  ai_summary: string | null;
  estimated_value: number;
  last_contact_at: string;
  conversation_id: number | null;
}

// ── Helpers ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PipelineStatus,
  { label: string; color: string; badgeClass: string }
> = {
  ia_atendendo: {
    label: "IA atendendo",
    color: "bg-blue-500",
    badgeClass:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-transparent",
  },
  qualificado: {
    label: "Qualificado",
    color: "bg-violet-500",
    badgeClass:
      "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-transparent",
  },
  transferido: {
    label: "Transferido",
    color: "bg-amber-500",
    badgeClass:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent",
  },
  orcamento_enviado: {
    label: "Orçamento enviado",
    color: "bg-orange-500",
    badgeClass:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-transparent",
  },
  venda_confirmada: {
    label: "Venda confirmada",
    color: "bg-emerald-500",
    badgeClass:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-transparent",
  },
  perdido: {
    label: "Perdido",
    color: "bg-red-500",
    badgeClass:
      "bg-red-500/15 text-red-600 dark:text-red-400 border-transparent",
  },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status as PipelineStatus] ?? {
      label: status,
      color: "bg-gray-500",
      badgeClass:
        "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-transparent",
    }
  );
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBarColor(score: number) {
  if (score >= 80) return "[&>div]:bg-emerald-500";
  if (score >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 dia atrás";
  return `${diffD} dias atrás`;
}

// ── Stats ──────────────────────────────────────────────────────

function StatsCards({ leads }: { leads: Lead[] }) {
  const stats = [
    {
      label: "IA Atendendo",
      value: leads.filter(
        (l) =>
          l.pipeline_status === "ia_atendendo" ||
          l.pipeline_status === "qualificado"
      ).length,
      icon: Bot,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Transferidos",
      value: leads.filter((l) => l.pipeline_status === "transferido").length,
      icon: ArrowRightLeft,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Orçamentos",
      value: leads.filter((l) => l.pipeline_status === "orcamento_enviado")
        .length,
      icon: FileText,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      label: "Vendas Confirmadas",
      value: leads.filter((l) => l.pipeline_status === "venda_confirmada")
        .length,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`rounded-lg p-2.5 ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Lead Card ──────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  const cfg = getStatusConfig(lead.pipeline_status);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${cfg.color} shrink-0`}
              />
              <h3 className="font-semibold truncate">{lead.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {lead.phone}
            </div>
          </div>
          <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
        </div>

        {/* Resumo IA */}
        {lead.ai_summary && (
          <div className="rounded-md bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <MessageSquareText className="h-3.5 w-3.5" />
              Resumo da IA
            </div>
            <p className="text-sm leading-relaxed">
              &ldquo;{lead.ai_summary}&rdquo;
            </p>
          </div>
        )}

        {/* Tags + meta */}
        <div className="space-y-2 text-sm">
          {lead.interest_tags.length > 0 && (
            <div className="flex items-start gap-2">
              <Tag className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {lead.interest_tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatCurrency(lead.estimated_value)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {timeAgo(lead.last_contact_at)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Star className={`h-4 w-4 ${scoreColor(lead.lead_score)}`} />
            <span className={`font-medium ${scoreColor(lead.lead_score)}`}>
              {lead.lead_score}
            </span>
            <Progress
              value={lead.lead_score}
              className={`flex-1 h-1.5 ${scoreBarColor(lead.lead_score)}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Table View ─────────────────────────────────────────────────

function LeadsTable({ leads }: { leads: Lead[] }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Interesses</TableHead>
            <TableHead>Valor Est.</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead className="text-right">Último contato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const cfg = getStatusConfig(lead.pipeline_status);
            return (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.phone}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {lead.interest_tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(lead.estimated_value)}
                </TableCell>
                <TableCell>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${scoreColor(lead.lead_score)}`}
                    >
                      {lead.lead_score}
                    </span>
                    <Progress
                      value={lead.lead_score}
                      className={`w-16 h-1.5 ${scoreBarColor(lead.lead_score)}`}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {timeAgo(lead.last_contact_at)}
                </TableCell>
              </TableRow>
            );
          })}
          {leads.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-8 text-muted-foreground"
              >
                Nenhum lead encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Main Content ───────────────────────────────────────────────

interface FollowupContentProps {
  orgId: string;
  initialLeads: Lead[];
}

export function FollowupContent({ orgId, initialLeads }: FollowupContentProps) {
  const leads = useRealtimeLeads(orgId, initialLeads);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("todos");
  const [view, setView] = useState<"cards" | "table">("cards");

  const filtered = leads.filter((lead) => {
    const matchesSearch =
      search === "" ||
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search);

    const matchesTab =
      tab === "todos" ||
      (tab === "ia_atendendo" &&
        (lead.pipeline_status === "ia_atendendo" ||
          lead.pipeline_status === "qualificado")) ||
      (tab === "transferido" && lead.pipeline_status === "transferido") ||
      (tab === "orcamento" && lead.pipeline_status === "orcamento_enviado") ||
      (tab === "venda" && lead.pipeline_status === "venda_confirmada") ||
      (tab === "perdido" && lead.pipeline_status === "perdido");

    return matchesSearch && matchesTab;
  });

  return (
    <>
      {/* Stats */}
      <StatsCards leads={leads} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ia_atendendo">IA Atendendo</TabsTrigger>
            <TabsTrigger value="transferido">Transferidos</TabsTrigger>
            <TabsTrigger value="orcamento">Orçamentos</TabsTrigger>
            <TabsTrigger value="venda">Vendas</TabsTrigger>
            <TabsTrigger value="perdido">Perdidos</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-md border">
            <button
              onClick={() => setView("cards")}
              className={`px-3 py-2 text-xs font-medium rounded-l-md transition-colors ${
                view === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-2 text-xs font-medium rounded-r-md transition-colors ${
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Tabela
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Nenhum lead encontrado.
            </div>
          )}
        </div>
      ) : (
        <LeadsTable leads={filtered} />
      )}
    </>
  );
}
