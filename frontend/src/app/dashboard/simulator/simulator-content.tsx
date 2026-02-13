"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  FlaskConical,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SimMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  qualification?: {
    interesse?: string;
    valor_estimado?: number;
    urgencia?: string;
  } | null;
  internalNotes?: string[];
  transferred?: boolean;
}

interface SimulatorContentProps {
  orgId: string;
  accountId: number;
  orgName: string;
}

export function SimulatorContent({
  orgId,
  accountId,
  orgName,
}: SimulatorContentProps) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || loading) return;

    const userMsg: SimMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Reset textarea height and keep focus
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }

    try {
      // Build history from previous messages (not including the one we just added)
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/backend-api/api/chat/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          account_id: accountId,
          message: content,
          history,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro na simulacao");
      }

      const data = await res.json();

      const botMsg: SimMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "Sem resposta.",
        timestamp: new Date(),
        qualification: data.qualification,
        internalNotes: data.internal_notes,
        transferred: data.transferred,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Erro: ${errorMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, messages, orgId, accountId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-shark-blue/15">
            <FlaskConical className="h-5 w-5 text-shark-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Simulador de Chat
            </h1>
            <p className="text-xs text-slate-400">
              Teste sua IA antes de colocar em producao
            </p>
          </div>
          <Badge variant="outline" className="ml-2 text-xs">
            {orgName}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs"
          >
            {showDebug ? (
              <ChevronUp className="mr-1 h-3 w-3" />
            ) : (
              <ChevronDown className="mr-1 h-3 w-3" />
            )}
            Debug
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={messages.length === 0 && !loading}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-6 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-shark-blue/10">
                <Bot className="h-8 w-8 text-shark-blue" />
              </div>
              <h2 className="text-lg font-medium text-white">
                Teste sua IA aqui
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-400">
                Envie uma mensagem para simular como a IA responde aos seus
                clientes. Usa o mesmo prompt, base de conhecimento e
                personalidade configurados.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {/* Message bubble */}
                  <div
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex max-w-[75%] gap-2 ${
                        msg.role === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          msg.role === "user"
                            ? "bg-shark-blue/20"
                            : "bg-slate-700"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <User className="h-4 w-4 text-shark-blue" />
                        ) : (
                          <Bot className="h-4 w-4 text-slate-300" />
                        )}
                      </div>

                      {/* Content */}
                      <div>
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm ${
                            msg.role === "user"
                              ? "bg-shark-blue text-white"
                              : "bg-slate-800 text-slate-200"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <div
                          className={`mt-1 flex items-center gap-2 px-1 ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="text-[10px] text-slate-500">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.transferred && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Transferiria para humano
                            </Badge>
                          )}
                        </div>

                        {/* Debug info */}
                        {showDebug &&
                          msg.role === "assistant" &&
                          (msg.qualification || (msg.internalNotes && msg.internalNotes.length > 0)) && (
                            <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
                              {msg.internalNotes && msg.internalNotes.length > 0 && (
                                <div className="mb-2">
                                  <span className="font-medium text-amber-400">
                                    Notas Internas:
                                  </span>
                                  {msg.internalNotes.map((note, i) => (
                                    <p key={i} className="mt-1 text-slate-400">
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {msg.qualification && (
                                <div>
                                  <span className="font-medium text-emerald-400">
                                    Qualificacao:
                                  </span>
                                  <p className="mt-1 text-slate-400">
                                    Interesse: {msg.qualification.interesse || "-"}
                                    {" | "}
                                    Valor: R${" "}
                                    {msg.qualification.valor_estimado ?? 0}
                                    {" | "}
                                    Urgencia: {msg.qualification.urgencia || "-"}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700">
                      <Bot className="h-4 w-4 text-slate-300" />
                    </div>
                    <div className="rounded-2xl bg-slate-800 px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 bg-slate-950 px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem para testar a IA..."
            disabled={loading}
            rows={1}
            className="flex-1 resize-none overflow-hidden rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shark-blue disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: "44px" }}
          />
          <Button
            size="icon"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="h-11 w-11 shrink-0 rounded-xl bg-shark-blue hover:bg-shark-blue/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          Simulacao — nenhum lead real sera criado e nenhuma transferencia sera executada.
        </p>
      </div>
    </div>
  );
}
