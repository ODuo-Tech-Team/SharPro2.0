"use client";

import { useState } from "react";
import { Smartphone, Power, RefreshCw, Loader2 } from "lucide-react";

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
  onDisconnect: (instanceId: string) => void;
}

export function InstanceCard({ instance, onShowQr, onRefreshStatus, onDisconnect }: InstanceCardProps) {
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const connected: boolean = instance.status === "connected";
  const displayName: string = instance.display_name || instance.instance_name;
  const phoneNumber: string = instance.phone_number || instance.instance_name;

  const handleDisconnect = async (): Promise<void> => {
    if (!confirm("Desconectar o WhatsApp desta instancia? Voce podera conectar outro numero depois.")) return;
    setDisconnecting(true);
    try {
      await onDisconnect(instance.id);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefreshStatus(instance.id);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
      {/* Top: Icon + Status badge */}
      <div className="flex justify-between items-start mb-4">
        <div
          className={`p-3 rounded-xl ${
            connected
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          <Smartphone size={24} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Atualizar status"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
          <div
            className={`px-2 py-1 rounded text-xs font-mono ${
              connected
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {connected ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
      </div>

      {/* Name + Phone */}
      <h3 className="text-lg font-bold text-white truncate">{displayName}</h3>
      <p className="text-slate-400 text-sm mb-6 truncate">{phoneNumber}</p>

      {/* Connected state */}
      {connected && (
        <div className="space-y-4">
          {/* Battery indicator */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Bateria</span>
              <span className="text-xs text-green-400 font-mono">85%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full w-[85%] transition-all" />
            </div>
          </div>

          {/* Disconnect button */}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full py-2 border border-red-900/30 text-red-400 hover:bg-red-950/30 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {disconnecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Power size={16} />
            )}
            Desconectar
          </button>
        </div>
      )}

      {/* Disconnected state */}
      {!connected && (
        <div className="space-y-4">
          {/* QR placeholder */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center">
            <span className="text-slate-600 text-sm">QR Code Indisponivel</span>
          </div>

          {/* Generate QR button */}
          <button
            onClick={() => onShowQr(instance.id)}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw size={16} />
            Gerar QR Code
          </button>
        </div>
      )}
    </div>
  );
}
