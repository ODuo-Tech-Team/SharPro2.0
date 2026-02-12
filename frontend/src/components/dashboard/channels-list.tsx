"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [loading, setLoading] = useState(true);
  const [qrModalInstanceId, setQrModalInstanceId] = useState<string | null>(null);

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

  const handleDisconnect = async (instanceId: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}/disconnect`,
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Smartphone className="h-5 w-5" />
            Meus Canais WhatsApp
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {`${instances.length} conexoes ativas`}
          </p>
        </CardHeader>
        <CardContent>
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
                Entre em contato com o administrador para adicionar um numero.
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
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
