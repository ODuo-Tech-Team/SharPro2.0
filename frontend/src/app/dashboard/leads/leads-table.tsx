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
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  conversion_value: number | null;
  created_at: string;
}

interface LeadsTableProps {
  orgId: string;
  initialLeads: Lead[];
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

const ITEMS_PER_PAGE = 10;

export function LeadsTable({ orgId, initialLeads }: LeadsTableProps) {
  const leads = useRealtimeLeads(orgId, initialLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLeads = useMemo(() => {
    let result = leads;

    // Text search
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.name?.toLowerCase().includes(term) ||
          lead.phone?.includes(term)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    return result;
  }, [leads, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / ITEMS_PER_PAGE));
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}{" "}
            encontrado{filteredLeads.length !== 1 ? "s" : ""}
          </CardTitle>

          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 sm:w-[260px]"
              />
            </div>

            {/* Status filter */}
            <div className="flex gap-1">
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
          </div>
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
