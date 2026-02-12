"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, RefreshCw, CheckCircle } from "lucide-react";

interface QrModalProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function QrModal({ instanceId, open, onClose, onConnected }: QrModalProps) {
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchQr = useCallback(async (retryCount = 0) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}/qrcode`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Erro ao buscar QR Code");
      }
      const data = await res.json();
      if (data.qrcode) {
        setQrCode(data.qrcode);
      } else if (retryCount < 3) {
        const delay = (retryCount + 1) * 2000;
        setTimeout(() => fetchQr(retryCount + 1), delay);
        return;
      } else {
        setError("QR Code nao disponivel. Tente novamente em alguns segundos.");
      }
    } catch (err: any) {
      if (retryCount < 3) {
        const delay = (retryCount + 1) * 2000;
        setTimeout(() => fetchQr(retryCount + 1), delay);
        return;
      }
      setError(err.message || "Erro ao buscar QR Code");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  // Poll instance status every 5s to detect WhatsApp connection
  useEffect(() => {
    if (!open || !instanceId || connected) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}/status`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.connection === "connected") {
          setConnected(true);
          onConnected?.();
          setTimeout(() => onClose(), 1500);
        }
      } catch {
        // ignore
      }
    };

    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [open, instanceId, connected, onClose, onConnected]);

  // Fetch QR on open
  useEffect(() => {
    if (open && instanceId && !qrCode) {
      const timer = setTimeout(() => fetchQr(), 500);
      return () => clearTimeout(timer);
    }
  }, [open, instanceId]);

  // Auto-refresh QR every 30s
  useEffect(() => {
    if (!open || connected) return;
    const interval = setInterval(() => fetchQr(), 30000);
    return () => clearInterval(interval);
  }, [open, instanceId, connected]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open && instanceId) {
      setQrCode("");
      setError("");
      setConnected(false);
      setLoading(false);
    }
  }, [open, instanceId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-1 text-lg font-semibold">Conectar WhatsApp</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Escaneie o QR Code abaixo com seu WhatsApp.
        </p>

        <div className="flex min-h-[280px] items-center justify-center rounded-lg border bg-white p-4">
          {connected ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-16 w-16 text-emerald-500" />
              <p className="text-lg font-semibold text-emerald-600">WhatsApp Conectado!</p>
              <p className="text-sm text-muted-foreground">Fechando automaticamente...</p>
            </div>
          ) : loading ? (
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          ) : error ? (
            <div className="text-center">
              <p className="mb-2 text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={() => fetchQr()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </Button>
            </div>
          ) : qrCode ? (
            <img
              src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR Code WhatsApp"
              className="h-64 w-64"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Aguardando QR Code...</p>
          )}
        </div>

        <div className="mt-4 flex justify-between">
          <Button size="sm" variant="ghost" onClick={() => fetchQr()} disabled={loading} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar QR
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
