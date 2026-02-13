"use client";

import { useState, useEffect, useCallback } from "react";
import { InstanceCard } from "@/components/dashboard/instance-card";
import { QrModal } from "@/components/dashboard/qr-modal";
import { Loader2, Smartphone } from "lucide-react";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  created_at: string;
}

interface ChannelsListProps {
  accountId: number;
}

export function ChannelsList({ accountId }: ChannelsListProps) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [qrModalInstanceId, setQrModalInstanceId] = useState<string | null>(null);

  const fetchInstances = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `${"/backend-api"}/api/instances/org/${accountId}`
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

  const handleShowQr = (instanceId: string): void => {
    setQrModalInstanceId(instanceId);
  };

  const handleRefreshStatus = async (instanceId: string): Promise<void> => {
    try {
      const res = await fetch(
        `${"/backend-api"}/api/instances/${instanceId}/status`
      );
      if (res.ok) {
        await fetchInstances();
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
    }
  };

  const handleDisconnect = async (instanceId: string): Promise<void> => {
    try {
      const res = await fetch(
        `${"/backend-api"}/api/instances/${instanceId}/disconnect`,
        { method: "POST" }
      );
      if (res.ok) {
        await fetchInstances();
      }
    } catch (err) {
      console.error("Error disconnecting instance:", err);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-white">Meus Canais</h2>
          <p className="text-slate-400 mt-1">
            Gerencie as conexões de WhatsApp da sua empresa.
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          </div>
        ) : instances.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <Smartphone className="mx-auto mb-4 h-12 w-12 text-slate-700" />
            <p className="text-lg font-semibold text-white mb-1">
              Nenhum canal configurado
            </p>
            <p className="text-sm text-slate-400">
              Entre em contato com o administrador para adicionar um número.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {instances.map((inst: WhatsAppInstance) => (
              <InstanceCard
                key={inst.id}
                instance={inst}
                onShowQr={handleShowQr}
                onRefreshStatus={handleRefreshStatus}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </div>

      <QrModal
        instanceId={qrModalInstanceId ?? ""}
        open={!!qrModalInstanceId}
        onClose={() => {
          setQrModalInstanceId(null);
          fetchInstances();
        }}
        onConnected={fetchInstances}
      />
    </>
  );
}
