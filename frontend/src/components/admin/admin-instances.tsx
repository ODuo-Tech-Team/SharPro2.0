"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Smartphone, Plus, RefreshCw } from "lucide-react";

interface Instance {
  id: string;
  display_name?: string;
  name?: string;
  phone_number?: string;
  status?: string;
  is_connected?: boolean;
  [key: string]: any;
}

interface AdminInstancesProps {
  orgId: string;
  accessToken: string;
  onUpdate?: () => void;
}

export function AdminInstances({ orgId, accessToken, onUpdate }: AdminInstancesProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Register form state
  const [uazapiToken, setUazapiToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registering, setRegistering] = useState(false);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Message feedback
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const showMsg = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/organizations/${orgId}/instances`,
        { headers }
      );
      if (!res.ok) {
        throw new Error("Erro ao carregar instancias");
      }
      const data = await res.json();
      setInstances(data.instances || data || []);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar instancias");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, apiUrl]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleRegister = async () => {
    if (!uazapiToken.trim()) {
      showMsg("Token da instancia e obrigatorio", "error");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/organizations/${orgId}/instances/register`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            uazapi_token: uazapiToken.trim(),
            display_name: displayName.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Erro ao registrar instancia");
      }

      setUazapiToken("");
      setDisplayName("");
      showMsg("Instancia registrada com sucesso!");
      await fetchInstances();
      onUpdate?.();
    } catch (err: any) {
      showMsg(err.message || "Erro ao registrar instancia", "error");
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (instanceId: string) => {
    setDeletingId(instanceId);
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/organizations/${orgId}/instances/${instanceId}`,
        {
          method: "DELETE",
          headers,
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Erro ao deletar instancia");
      }

      showMsg("Instancia removida com sucesso!");
      setConfirmDeleteId(null);
      await fetchInstances();
      onUpdate?.();
    } catch (err: any) {
      showMsg(err.message || "Erro ao deletar instancia", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const getInstanceName = (inst: Instance) => {
    return inst.display_name || inst.name || "Sem nome";
  };

  const isConnected = (inst: Instance) => {
    return inst.is_connected === true || inst.status === "connected";
  };

  return (
    <div className="space-y-4">
      {/* Message feedback */}
      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            messageType === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Instance List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Instancias Registradas</Label>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchInstances}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-md bg-destructive/10 px-3 py-4 text-center text-sm text-destructive">
            {error}
          </div>
        ) : instances.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhuma instancia registrada para esta organizacao.
          </div>
        ) : (
          <div className="space-y-2">
            {instances.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between rounded-md border px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {getInstanceName(inst)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inst.phone_number || "Sem numero"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={isConnected(inst) ? "success" : "secondary"}
                    className="text-xs"
                  >
                    {isConnected(inst) ? "Conectado" : "Desconectado"}
                  </Badge>

                  {confirmDeleteId === inst.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(inst.id)}
                        disabled={deletingId === inst.id}
                        className="h-7 text-xs px-2"
                      >
                        {deletingId === inst.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Confirmar"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-7 text-xs px-2"
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDeleteId(inst.id)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <hr className="border-border" />

      {/* Register Form */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Registrar Nova Instancia</Label>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Token da Instancia Uazapi *
          </Label>
          <Input
            value={uazapiToken}
            onChange={(e) => setUazapiToken(e.target.value)}
            placeholder="Cole o token da instancia Uazapi aqui"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Nome (opcional)
          </Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex: WhatsApp Vendas"
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleRegister}
            disabled={registering || !uazapiToken.trim()}
            size="sm"
            className="gap-1.5"
          >
            {registering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Registrar Instancia
          </Button>
        </div>
      </div>
    </div>
  );
}
