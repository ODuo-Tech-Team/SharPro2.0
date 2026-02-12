"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

// ── Types ──────────────────────────────────────────────────────

type LeadStatus =
  | "ia_atendendo"
  | "transferido"
  | "orcamento_enviado"
  | "venda_confirmada"
  | "perdido";

interface FollowupLead {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  resumoIA: string;
  interesses: string[];
  valorEstimado: string;
  ultimoContato: string;
  score: number;
}

// ── Mock Data ──────────────────────────────────────────────────

const MOCK_LEADS: FollowupLead[] = [
  {
    id: "1",
    name: "Maria Silva",
    phone: "+55 11 98765-4321",
    status: "transferido",
    resumoIA:
      "Cliente interessada em portao automatico pivotante 3m. Quer orcamento com instalacao. Mencionou urgencia, obra em andamento.",
    interesses: ["Portao pivotante", "Motor PPA"],
    valorEstimado: "R$ 4.500",
    ultimoContato: "2h atras",
    score: 85,
  },
  {
    id: "2",
    name: "Carlos Oliveira",
    phone: "+55 11 91234-5678",
    status: "orcamento_enviado",
    resumoIA:
      "Precisa de kit motor deslizante para portao de 5m, com 3 controles remotos. Comparando precos com concorrente.",
    interesses: ["Motor deslizante", "Controles remotos"],
    valorEstimado: "R$ 2.800",
    ultimoContato: "5h atras",
    score: 72,
  },
  {
    id: "3",
    name: "Ana Souza",
    phone: "+55 21 99876-5432",
    status: "venda_confirmada",
    resumoIA:
      "Fechou cerca eletrica para residencia, 50m de extensao. Pediu instalacao para sabado. Pagamento via PIX.",
    interesses: ["Cerca eletrica", "Instalacao"],
    valorEstimado: "R$ 3.200",
    ultimoContato: "1 dia atras",
    score: 91,
  },
  {
    id: "4",
    name: "Pedro Santos",
    phone: "+55 31 98765-1234",
    status: "ia_atendendo",
    resumoIA:
      "Perguntando sobre camera IP com visao noturna e DVR de 8 canais. Ainda coletando informacoes sobre metragem.",
    interesses: ["Camera IP", "DVR 8 canais"],
    valorEstimado: "R$ 1.900",
    ultimoContato: "15min atras",
    score: 45,
  },
  {
    id: "5",
    name: "Julia Costa",
    phone: "+55 41 99988-7766",
    status: "transferido",
    resumoIA:
      "Sindica de predio, precisa de interfone coletivo 12 pontos. Pediu visita tecnica para orcamento. Projeto grande.",
    interesses: ["Interfone coletivo", "Visita tecnica"],
    valorEstimado: "R$ 6.800",
    ultimoContato: "1h atras",
    score: 68,
  },
  {
    id: "6",
    name: "Ricardo Lima",
    phone: "+55 51 98877-6655",
    status: "orcamento_enviado",
    resumoIA:
      "Quer portao social com automatizacao. Ja tem medidas e projeto do arquiteto. Aguardando retorno do orcamento.",
    interesses: ["Portao social", "Automatizacao"],
    valorEstimado: "R$ 5.200",
    ultimoContato: "3h atras",
    score: 78,
  },
  {
    id: "7",
    name: "Fernanda Dias",
    phone: "+55 61 99111-2233",
    status: "venda_confirmada",
    resumoIA:
      "Contratou alarme monitorado para loja comercial. Plano mensal com monitoramento 24h. Instalacao agendada.",
    interesses: ["Alarme monitorado", "Monitoramento 24h"],
    valorEstimado: "R$ 890/mes",
    ultimoContato: "2 dias atras",
    score: 95,
  },
  {
    id: "8",
    name: "Bruno Alves",
    phone: "+55 71 98800-4455",
    status: "ia_atendendo",
    resumoIA:
      "Consulta inicial sobre cerca concertina. Ainda nao passou detalhes de metragem ou local. Baixo engajamento.",
    interesses: ["Cerca concertina"],
    valorEstimado: "R$ 0",
    ultimoContato: "30min atras",
    score: 22,
  },
];

// ── Helpers ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; badgeClass: string }
> = {
  ia_atendendo: {
    label: "IA atendendo",
    color: "bg-blue-500",
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-transparent",
  },
  transferido: {
    label: "Transferido",
    color: "bg-amber-500",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent",
  },
  orcamento_enviado: {
    label: "Orcamento enviado",
    color: "bg-orange-500",
    badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-transparent",
  },
  venda_confirmada: {
    label: "Venda confirmada",
    color: "bg-emerald-500",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-transparent",
  },
  perdido: {
    label: "Perdido",
    color: "bg-red-500",
    badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400 border-transparent",
  },
};

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

// ── Stats ──────────────────────────────────────────────────────

function StatsCards({ leads }: { leads: FollowupLead[] }) {
  const stats = [
    {
      label: "Atendimentos IA",
      value: leads.filter((l) => l.status === "ia_atendendo").length,
      total: leads.length,
      icon: Bot,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Transferidos",
      value: leads.filter((l) => l.status === "transferido").length,
      total: leads.length,
      icon: ArrowRightLeft,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Orcamentos",
      value: leads.filter((l) => l.status === "orcamento_enviado").length,
      total: leads.length,
      icon: FileText,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      label: "Vendas Confirmadas",
      value: leads.filter((l) => l.status === "venda_confirmada").length,
      total: leads.length,
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

// ── Lead Card (expandido) ──────────────────────────────────────

function LeadCard({ lead }: { lead: FollowupLead }) {
  const cfg = STATUS_CONFIG[lead.status];

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
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <MessageSquareText className="h-3.5 w-3.5" />
            Resumo da IA
          </div>
          <p className="text-sm leading-relaxed">&ldquo;{lead.resumoIA}&rdquo;</p>
        </div>

        {/* Tags + meta */}
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Tag className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1.5">
              {lead.interesses.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{lead.valorEstimado}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {lead.ultimoContato}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Star className={`h-4 w-4 ${scoreColor(lead.score)}`} />
            <span className={`font-medium ${scoreColor(lead.score)}`}>
              {lead.score}
            </span>
            <Progress
              value={lead.score}
              className={`flex-1 h-1.5 ${scoreBarColor(lead.score)}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Table View ─────────────────────────────────────────────────

function LeadsTable({ leads }: { leads: FollowupLead[] }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>O que quer</TableHead>
            <TableHead>Valor Est.</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead className="text-right">Ultimo contato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const cfg = STATUS_CONFIG[lead.status];
            return (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.phone}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {lead.interesses.map((tag) => (
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
                  {lead.valorEstimado}
                </TableCell>
                <TableCell>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${scoreColor(lead.score)}`}>
                      {lead.score}
                    </span>
                    <Progress
                      value={lead.score}
                      className={`w-16 h-1.5 ${scoreBarColor(lead.score)}`}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {lead.ultimoContato}
                </TableCell>
              </TableRow>
            );
          })}
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                Nenhum lead encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────

export default function FollowupPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("todos");
  const [view, setView] = useState<"cards" | "table">("cards");

  const filtered = MOCK_LEADS.filter((lead) => {
    const matchesSearch =
      search === "" ||
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search);

    const matchesTab =
      tab === "todos" ||
      (tab === "ia_atendendo" && lead.status === "ia_atendendo") ||
      (tab === "transferido" && lead.status === "transferido") ||
      (tab === "orcamento" && lead.status === "orcamento_enviado") ||
      (tab === "venda" && lead.status === "venda_confirmada");

    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Follow-up de Vendas
        </h1>
        <p className="text-muted-foreground">
          Acompanhe o pipeline de vendas e os resumos gerados pela IA.
        </p>
      </div>

      {/* Stats */}
      <StatsCards leads={MOCK_LEADS} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ia_atendendo">IA Atendendo</TabsTrigger>
            <TabsTrigger value="transferido">Transferidos</TabsTrigger>
            <TabsTrigger value="orcamento">Orcamentos</TabsTrigger>
            <TabsTrigger value="venda">Vendas</TabsTrigger>
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
    </div>
  );
}
