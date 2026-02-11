"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Pencil, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { EditClientModal } from "@/components/admin/edit-client-modal";

interface Organization {
  id: string;
  name: string;
  is_active?: boolean;
  plans?: { id: string; name: string } | null;
  owner?: { id: string; email: string; full_name?: string } | null;
  whatsapp_connected?: boolean;
  instance_count?: number;
  created_at?: string;
  [key: string]: any;
}

interface Plan {
  id: string;
  name: string;
  [key: string]: any;
}

interface ClientsTableProps {
  organizations: Organization[];
  plans: Plan[];
  accessToken: string;
}

const PAGE_SIZE = 10;

export function ClientsTable({ organizations, plans, accessToken }: ClientsTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);

  const filtered = organizations.filter((org) => {
    const term = search.toLowerCase();
    return (
      org.name?.toLowerCase().includes(term) ||
      org.owner?.email?.toLowerCase().includes(term) ||
      org.owner?.full_name?.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageOrgs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleImpersonate = async (orgId: string) => {
    try {
      // Save current admin session
      localStorage.setItem("admin_session_backup", "true");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/impersonate/${orgId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) throw new Error("Failed to generate magic link");
      const data = await res.json();

      if (data.magic_link && data.magic_link.startsWith("http")) {
        localStorage.setItem("impersonating_org", orgId);
        window.location.href = data.magic_link;
      } else {
        throw new Error("Link de acesso invalido");
      }
    } catch (err) {
      console.error("Impersonate error:", err);
    }
  };

  return (
    <>
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email Dono</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageOrgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma organizacao encontrada.
                </TableCell>
              </TableRow>
            ) : (
              pageOrgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.owner?.email || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {org.plans?.name || "Sem plano"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={org.is_active !== false ? "success" : "destructive"}
                      className="text-xs"
                    >
                      {org.is_active !== false ? "Ativo" : "Bloqueado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={org.whatsapp_connected ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {org.whatsapp_connected ? "Conectado" : "Desconectado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditOrg(org)}
                        className="gap-1.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleImpersonate(org.id)}
                        className="gap-1.5 text-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Acessar Painel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de{" "}
            {filtered.length} organizacoes
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOrg && (
        <EditClientModal
          organization={editOrg}
          plans={plans}
          accessToken={accessToken}
          open={!!editOrg}
          onClose={() => setEditOrg(null)}
        />
      )}
    </>
  );
}
