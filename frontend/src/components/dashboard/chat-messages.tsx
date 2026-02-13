"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatInput } from "@/components/dashboard/chat-input";
import { Loader2, Bot, UserCheck, RotateCcw, MessageSquare } from "lucide-react";

interface Message {
  id: number;
  content: string | null;
  message_type: number; // 0 = incoming, 1 = outgoing
  private: boolean;
  created_at: number;
  sender?: {
    id: number;
    name: string;
    type: string;
  };
  content_type?: string;
}

interface ChatMessagesProps {
  accountId: number;
  conversationId: number | null;
  contactName: string;
  aiStatus?: string;
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ChatMessages({
  accountId,
  conversationId,
  contactName,
  aiStatus,
}: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    if (isFirstLoad.current) setLoading(true);

    try {
      const res = await fetch(
        `${"/backend-api"}/api/chatwoot/conversations/${accountId}/${conversationId}/messages?_t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      const payload: Message[] = data.payload ?? [];

      // Sort chronologically (oldest first)
      payload.sort((a, b) => a.created_at - b.created_at);

      setMessages(payload);
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [accountId, conversationId]);

  // Initial fetch + fast polling + SSE enhancement
  useEffect(() => {
    if (!conversationId) return;

    isFirstLoad.current = true;
    fetchMessages();

    // Reliable polling every 1.5s as baseline
    const interval = setInterval(fetchMessages, 1500);

    // Try SSE for instant updates (bonus - polling handles it if SSE fails)
    let eventSource: EventSource | null = null;
    try {
      const sseUrl = `${"/backend-api"}/api/sse/messages/${accountId}/${conversationId}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const newMsg: Message = JSON.parse(event.data);
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        // SSE failed - just close it, polling handles everything
        eventSource?.close();
        eventSource = null;
      };
    } catch {
      // EventSource not supported or failed - polling handles it
    }

    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
  }, [conversationId, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleReactivate = async () => {
    if (!conversationId || reactivating) return;
    setReactivating(true);
    try {
      const res = await fetch(
        `${"/backend-api"}/api/conversations/${conversationId}/reactivate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to reactivate");
    } catch (err) {
      console.error("Reactivate error:", err);
    } finally {
      setReactivating(false);
    }
  };

  // Empty state
  if (!conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">Selecione uma conversa</p>
        <p className="text-sm">Escolha uma conversa na lista para ver as mensagens.</p>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const dateStr = formatMessageDate(msg.created_at);
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, msgs: [] });
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(msg);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-shark-blue/10 text-shark-blue font-medium text-sm">
            {contactName?.charAt(0)?.toUpperCase() || "#"}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{contactName || `Conversa #${conversationId}`}</h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">#{conversationId}</span>
              {aiStatus && (
                <Badge
                  variant={aiStatus === "active" ? "success" : "destructive"}
                  className="text-[10px] gap-0.5"
                >
                  {aiStatus === "active" ? (
                    <><Bot className="h-2.5 w-2.5" /> IA Ativa</>
                  ) : (
                    <><UserCheck className="h-2.5 w-2.5" /> Humano</>
                  )}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {aiStatus === "paused" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReactivate}
            disabled={reactivating}
            className="gap-1.5 text-xs"
          >
            {reactivating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reativar IA
          </Button>
        )}
      </div>

      {/* Messages area */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
          <div className="flex min-h-full flex-col justify-end">
            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="my-3 flex items-center gap-3">
                  <div className="flex-1 border-t" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {group.date}
                  </span>
                  <div className="flex-1 border-t" />
                </div>

                {group.msgs
                  .filter((msg) => !msg.private && msg.content)
                  .map((msg) => {
                    const isOutgoing = msg.message_type === 1;
                    return (
                      <div
                        key={msg.id}
                        className={`mb-2 flex ${isOutgoing ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                            isOutgoing
                              ? "bg-shark-blue text-white rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {isOutgoing && msg.sender?.type === "contact" ? null : isOutgoing && (
                            <p className="mb-0.5 text-[10px] font-medium opacity-70">
                              {msg.sender?.name || "Agente"}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p
                            className={`mt-1 text-[10px] ${
                              isOutgoing ? "text-white/60" : "text-muted-foreground"
                            } text-right`}
                          >
                            {formatMessageTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Input */}
      <ChatInput
        accountId={accountId}
        conversationId={conversationId}
        onMessageSent={fetchMessages}
      />
    </div>
  );
}
