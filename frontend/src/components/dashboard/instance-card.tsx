"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Loader2, Smartphone, Trash2, QrCode, RefreshCw } from "lucide-react";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  created_at: string;
}

interface InstanceCardProps {
  instance: WhatsAppInstance;
  onShowQr: (instanceId: string) => void;
  onRefreshStatus: (instanceId: string) => void;
  onDelete: (instanceId: string) => void;
}

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  connected: { label: "Conectado", variant: "success" },
  connecting: { label: "Conectando", variant: "warning" },
  disconnected: { label: "Desconectado", variant: "destructive" },
  pending: { label: "Pendente", variant: "secondary" },
  error: { label: "Erro", variant: "destructive" },
};

export function InstanceCard({ instance, onShowQr, onRefreshStatus, onDelete }: InstanceCardProps) {
  const [deleting, setDeleting] = useState(false);
  const statusInfo = STATUS_MAP[instance.status] ?? STATUS_MAP.pending;

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja remover esta instancia?")) return;
    setDeleting(true);
    await onDelete(instance.id);
    setDeleting(false);
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
          instance.status === "connected"
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-muted text-muted-foreground"
        }`}>
          <Smartphone className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">
              {instance.display_name || instance.instance_name}
            </h3>
            <Badge variant={statusInfo.variant} className="text-[10px]">
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {instance.phone_number || instance.instance_name}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {instance.status !== "connected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onShowQr(instance.id)}
              className="gap-1 text-xs"
            >
              <QrCode className="h-3.5 w-3.5" />
              QR Code
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRefreshStatus(instance.id)}
            title="Atualizar status"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleting}
            title="Remover instancia"
            className="text-destructive hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
