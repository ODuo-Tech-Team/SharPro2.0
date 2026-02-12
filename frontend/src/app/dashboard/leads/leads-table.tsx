"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeLeads } from "@/hooks/use-realtime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";

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

interface LeadsTableProps {
  orgId: string;
  initialLeads: Lead[];
  accountId?: number;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: "info" | "warning" | "success" | "destructive" }
> = {
  new: { label: "Novo", variant: "info" },
  qualified: { label: "Qualificado", variant: "warning" },
  converted: { label: "Convertido", variant: "success" },
  lost: { label: "Perdido", variant: "destructive" },
};

const ORIGIN_MAP: Record<string, string> = {
  organic: "Organico",
  campaign: "Campanha",
  whatsapp: "WhatsApp",
  manual: "Manual",
};

const ITEMS_PER_PAGE = 10;

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-slate-700">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{score}</span>
    </div>
  );
}

export function LeadsTable({ orgId, initialLeads, accountId }: LeadsTableProps) {
  const leads = useRealtimeLeads(orgId, initialLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLeads = useMemo(() => {
    let result = leads;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.name?.toLowerCase().includes(term) ||
          lead.phone?.includes(term)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    if (originFilter !== "all") {
      result = result.filter((lead) => lead.origin === originFilter);
    }

    return result;
  }, [leads, search, statusFilter, originFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredLeads.length / ITEMS_PER_PAGE)
  );
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleOriginFilter = (value: string) => {
    setOriginFilter(value);
    setCurrentPage(1);
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (originFilter !== "all") params.set("origin", originFilter);

      const url = accountId
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/leads/${accountId}/export?${params}`
        : null;

      if (!url) {
        alert("Account ID não disponível para exportação.");
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao exportar");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export error:", err);
      alert("Erro ao exportar leads.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}{" "}
            encontrado{filteredLeads.length !== 1 ? "s" : ""}
          </CardTitle>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 sm:w-[220px]"
              />
            </div>

            {/* Origin filter */}
            <select
              value={originFilter}
              onChange={(e) => handleOriginFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">Todas origens</option>
              {Object.entries(ORIGIN_MAP).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            {/* Export */}
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="mr-1 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 mt-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter("all")}
          >
            Todos
          </Button>
          {Object.entries(STATUS_MAP).map(([key, { label }]) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {paginatedLeads.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum lead encontrado.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.map((lead) => {
                  const statusInfo = STATUS_MAP[lead.status] ?? {
                    label: lead.status,
                    variant: "secondary" as const,
                  };

                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        {lead.name || "Sem nome"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatPhone(lead.phone)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ScoreBar score={lead.lead_score || 0} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(lead.interest_tags || []).slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ORIGIN_MAP[lead.origin] || lead.origin || "\u2014"}
                      </TableCell>
                      <TableCell className="text-right">
                        {lead.conversion_value
                          ? formatCurrency(lead.conversion_value)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(lead.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Pagina {currentPage} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.max(1, p - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Proximo
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
