"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstanceCard } from "@/components/dashboard/instance-card";
import { QrModal } from "@/components/dashboard/qr-modal";
import { Loader2, Plus, Smartphone } from "lucide-react";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  created_at: string;
}

interface PlanInfo {
  max_connections: number;
}

interface ChannelsListProps {
  accountId: number;
  plan: PlanInfo | null;
}

export function ChannelsList({ accountId, plan }: ChannelsListProps) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [qrModalInstanceId, setQrModalInstanceId] = useState<string | null>(null);

  const maxConnections = plan?.max_connections ?? 1;
  const isUnlimited = maxConnections === -1;
  const canCreate = isUnlimited || instances.length < maxConnections;

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/org/${accountId}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInstances(data.instances ?? []);
    } catch (err) {
      console.error("Error fetching instances:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        const detail = data.detail;
        if (typeof detail === "object" && detail.error === "plan_limit_exceeded") {
          setError(`Limite do plano atingido: ${detail.current}/${detail.limit} conexoes. Faca upgrade.`);
        } else {
          setError(typeof detail === "string" ? detail : "Erro ao criar instancia.");
        }
        return;
      }

      if (data.instance?.id) {
        setQrModalInstanceId(data.instance.id);
      }
      await fetchInstances();
    } catch (err) {
      setError("Erro de rede ao criar instancia.");
    } finally {
      setCreating(false);
    }
  };

  const handleShowQr = (instanceId: string) => {
    setQrModalInstanceId(instanceId);
  };

  const handleRefreshStatus = async (instanceId: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}/status`
      );
      if (res.ok) {
        await fetchInstances();
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
    }
  };

  const handleDelete = async (instanceId: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchInstances();
      }
    } catch (err) {
      console.error("Error deleting instance:", err);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Smartphone className="h-5 w-5" />
              Meus Canais WhatsApp
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isUnlimited
                ? `${instances.length} conexoes ativas`
                : `${instances.length}/${maxConnections} conexoes do plano`}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !canCreate}
            className="gap-1.5 bg-shark-blue hover:bg-shark-blue/90"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar WhatsApp
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Smartphone className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">
                Nenhum canal configurado
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                Clique em "Adicionar WhatsApp" para conectar seu primeiro numero.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((inst) => (
                <InstanceCard
                  key={inst.id}
                  instance={inst}
                  onShowQr={handleShowQr}
                  onRefreshStatus={handleRefreshStatus}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <QrModal
        instanceId={qrModalInstanceId ?? ""}
        open={!!qrModalInstanceId}
        onClose={() => setQrModalInstanceId(null)}
      />
    </>
  );
}
