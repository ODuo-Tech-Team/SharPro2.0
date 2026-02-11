"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, RefreshCw, CheckCircle, Link2 } from "lucide-react";

interface QrModalProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function QrModal({ instanceId, open, onClose, onConnected }: QrModalProps) {
  const [step, setStep] = useState<"chatwoot" | "qr">("chatwoot");
  const [chatwootConnecting, setChatwootConnecting] = useState(false);
  const [chatwootConnected, setChatwootConnected] = useState(false);
  const [chatwootError, setChatwootError] = useState("");

  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const connectChatwoot = async () => {
    setChatwootConnecting(true);
    setChatwootError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/instances/${instanceId}/connect-chatwoot`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Erro ao conectar Chatwoot");
      }
      setChatwootConnected(true);
      // Auto-advance to QR step after brief success display
      setTimeout(() => setStep("qr"), 1000);
    } catch (err: any) {
      setChatwootError(err.message || "Erro ao conectar Chatwoot");
    } finally {
      setChatwootConnecting(false);
    }
  };

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
    if (!open || !instanceId || connected || step !== "qr") return;

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
  }, [open, instanceId, connected, step, onClose, onConnected]);

  // Fetch QR when entering QR step
  useEffect(() => {
    if (open && instanceId && step === "qr" && !qrCode) {
      const timer = setTimeout(() => fetchQr(), 500);
      return () => clearTimeout(timer);
    }
  }, [open, instanceId, step]);

  // Auto-refresh QR every 30s
  useEffect(() => {
    if (!open || connected || step !== "qr") return;
    const interval = setInterval(() => fetchQr(), 30000);
    return () => clearInterval(interval);
  }, [open, instanceId, connected, step]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open && instanceId) {
      setStep("chatwoot");
      setChatwootConnected(false);
      setChatwootConnecting(false);
      setChatwootError("");
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

        {step === "chatwoot" ? (
          <>
            <h2 className="mb-1 text-lg font-semibold">Conectar Chatwoot</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Primeiro, configure a integração com o Chatwoot para que as mensagens fluam corretamente.
            </p>

            <div className="flex min-h-[200px] items-center justify-center rounded-lg border bg-muted/30 p-6">
              {chatwootConnected ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <CheckCircle className="h-16 w-16 text-emerald-500" />
                  <p className="text-lg font-semibold text-emerald-600">Chatwoot Conectado!</p>
                  <p className="text-sm text-muted-foreground">Abrindo QR Code...</p>
                </div>
              ) : chatwootConnecting ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-shark-blue" />
                  <p className="text-sm text-muted-foreground">Configurando integração...</p>
                </div>
              ) : chatwootError ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-destructive">{chatwootError}</p>
                  <Button size="sm" variant="outline" onClick={connectChatwoot} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <Link2 className="h-12 w-12 text-shark-blue" />
                  <div>
                    <p className="text-sm font-medium">Integração Chatwoot</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clique abaixo para configurar o webhook e a integração com o Chatwoot.
                    </p>
                  </div>
                  <Button onClick={connectChatwoot} className="gap-2 bg-shark-blue hover:bg-shark-blue/90">
                    <Link2 className="h-4 w-4" />
                    Conectar Chatwoot
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep("qr")}
                className="text-xs text-muted-foreground"
              >
                Pular e ir para QR Code
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
