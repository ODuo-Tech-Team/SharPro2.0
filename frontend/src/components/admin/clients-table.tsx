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
import {
  Search,
  Pencil,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Building2,
  Mail,
  User,
  Calendar,
  Smartphone,
  Bot,
  Key,
  Link2,
  ArrowRightLeft,
} from "lucide-react";
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
  system_prompt?: string;
  openai_api_key?: string;
  chatwoot_account_id?: number;
  chatwoot_url?: string;
  chatwoot_token?: string;
  inbox_id?: number;
  ai_handoff_config?: {
    enabled?: boolean;
    keywords?: string[];
    farewell_message?: string;
    team_id?: number;
  };
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

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium truncate">{value || "-"}</div>
      </div>
    </div>
  );
}

export function ClientsTable({ organizations, plans, accessToken }: ClientsTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpand = (orgId: string) => {
    setExpandedId(expandedId === orgId ? null : orgId);
  };

  const handleImpersonate = async (orgId: string) => {
    try {
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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const maskKey = (key?: string) => {
    if (!key) return "-";
    if (key.length <= 8) return "****";
    return key.slice(0, 6) + "..." + key.slice(-4);
  };

  return (
    <>
      {/* Search + Counter */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, usuario ou email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "empresa" : "empresas"}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Usuario / Email</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageOrgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma empresa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              pageOrgs.map((org) => {
                const isExpanded = expandedId === org.id;
                const handoffConfig = org.ai_handoff_config || {};

                return (
                  <TableRow key={org.id} className="group">
                    {/* Expand button */}
                    <TableCell className="pr-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleExpand(org.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>

                    {/* Empresa */}
                    <TableCell className="font-medium">{org.name}</TableCell>

                    {/* Usuario / Email */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {org.owner?.full_name || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {org.owner?.email || "-"}
                        </p>
                      </div>
                    </TableCell>

                    {/* Plano */}
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {org.plans?.name || "Sem plano"}
                      </Badge>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge
                        variant={org.is_active !== false ? "success" : "destructive"}
                        className="text-xs"
                      >
                        {org.is_active !== false ? "Ativo" : "Bloqueado"}
                      </Badge>
                    </TableCell>

                    {/* WhatsApp */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <Badge
                          variant={org.whatsapp_connected ? "success" : "secondary"}
                          className="text-xs"
                        >
                          {org.whatsapp_connected ? "Conectado" : "Desconectado"}
                        </Badge>
                        {(org.instance_count ?? 0) > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {org.instance_count} {org.instance_count === 1 ? "instancia" : "instancias"}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Cadastro */}
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(org.created_at)}
                    </TableCell>

                    {/* Acoes */}
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Expanded Details - render outside table for proper layout */}
      {pageOrgs.map((org) => {
        if (expandedId !== org.id) return null;
        const handoffConfig = org.ai_handoff_config || {};

        return (
          <div
            key={`details-${org.id}`}
            className="rounded-lg border bg-muted/30 p-5 -mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center gap-2 border-b pb-3">
              <Building2 className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-base">{org.name}</h3>
              <span className="text-xs text-muted-foreground">- Detalhes Completos</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Informacoes Basicas */}
              <InfoItem icon={Building2} label="Empresa" value={org.name} />
              <InfoItem icon={User} label="Usuario" value={org.owner?.full_name || "-"} />
              <InfoItem icon={Mail} label="Email" value={org.owner?.email || "-"} />
              <InfoItem icon={Calendar} label="Data de Cadastro" value={formatDate(org.created_at)} />

              {/* Plano e Status */}
              <InfoItem
                icon={Key}
                label="Plano"
                value={
                  <Badge variant="outline" className="text-xs">
                    {org.plans?.name || "Sem plano"}
                  </Badge>
                }
              />
              <InfoItem
                icon={Key}
                label="Status"
                value={
                  <Badge
                    variant={org.is_active !== false ? "success" : "destructive"}
                    className="text-xs"
                  >
                    {org.is_active !== false ? "Ativo" : "Bloqueado"}
                  </Badge>
                }
              />

              {/* WhatsApp */}
              <InfoItem
                icon={Smartphone}
                label="WhatsApp"
                value={
                  <Badge
                    variant={org.whatsapp_connected ? "success" : "secondary"}
                    className="text-xs"
                  >
                    {org.whatsapp_connected ? "Conectado" : "Desconectado"}
                  </Badge>
                }
              />
              <InfoItem
                icon={Smartphone}
                label="Instancias WhatsApp"
                value={`${org.instance_count || 0}`}
              />

              {/* IA */}
              <InfoItem
                icon={Bot}
                label="System Prompt"
                value={org.system_prompt ? "Configurado" : "Nao configurado"}
              />
              <InfoItem
                icon={Key}
                label="OpenAI Key"
                value={maskKey(org.openai_api_key)}
              />

              {/* Chatwoot */}
              <InfoItem
                icon={Link2}
                label="Chatwoot Account ID"
                value={org.chatwoot_account_id?.toString() || "-"}
              />
              <InfoItem
                icon={Link2}
                label="Chatwoot URL"
                value={org.chatwoot_url || "-"}
              />
              <InfoItem
                icon={Link2}
                label="Chatwoot Token"
                value={maskKey(org.chatwoot_token)}
              />
              <InfoItem
                icon={Link2}
                label="Inbox ID"
                value={org.inbox_id?.toString() || "-"}
              />

              {/* Transbordo */}
              <InfoItem
                icon={ArrowRightLeft}
                label="Transbordo"
                value={
                  <Badge
                    variant={handoffConfig.enabled ? "success" : "secondary"}
                    className="text-xs"
                  >
                    {handoffConfig.enabled ? "Ativo" : "Desativado"}
                  </Badge>
                }
              />
              {handoffConfig.enabled && (
                <>
                  <InfoItem
                    icon={ArrowRightLeft}
                    label="Palavras-chave"
                    value={(handoffConfig.keywords || []).join(", ") || "-"}
                  />
                  <InfoItem
                    icon={ArrowRightLeft}
                    label="Team ID"
                    value={handoffConfig.team_id?.toString() || "-"}
                  />
                </>
              )}
            </div>

            {/* System Prompt Preview */}
            {org.system_prompt && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Bot className="h-3.5 w-3.5" />
                  System Prompt
                </p>
                <p className="text-sm bg-background rounded-md p-3 border max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {org.system_prompt}
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 border-t pt-3">
              <Button
                size="sm"
                variant="default"
                onClick={() => setEditOrg(org)}
                className="gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar Empresa
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleImpersonate(org.id)}
                className="gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Acessar Painel do Cliente
              </Button>
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de{" "}
            {filtered.length} empresas
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
