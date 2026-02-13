"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, MessageSquare } from "lucide-react";

interface ChatwootConversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: string;
  messages?: {
    id: number;
    content: string;
    message_type: number;
    created_at: number;
  }[];
  meta?: {
    sender?: {
      id: number;
      name: string;
      thumbnail: string;
    };
  };
  created_at: number;
  last_activity_at: number;
}

interface ConversationListProps {
  accountId: number;
  aiStatusMap?: Record<number, string>;
}

const STATUS_FILTERS = [
  { label: "Aberto", value: "open" },
  { label: "Pendente", value: "pending" },
  { label: "Resolvido", value: "resolved" },
];

export function ConversationList({
  accountId,
  aiStatusMap = {},
}: ConversationListProps) {
  const [conversations, setConversations] = useState<ChatwootConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchConversations = useCallback(
    async (pageNum: number, reset: boolean = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `${"/backend-api"}/api/chatwoot/conversations/${accountId}?status=${statusFilter}&page=${pageNum}`
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        const payload = data.data?.payload ?? [];
        const meta = data.data?.meta ?? {};

        if (reset) {
          setConversations(payload);
        } else {
          setConversations((prev) => [...prev, ...payload]);
        }

        // Check if there are more pages
        const allCount = meta.all_count ?? 0;
        const currentTotal = reset ? payload.length : conversations.length + payload.length;
        setHasMore(currentTotal < allCount);
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        setLoading(false);
      }
    },
    [accountId, statusFilter, conversations.length]
  );

  useEffect(() => {
    setPage(1);
    fetchConversations(1, true);
  }, [statusFilter, accountId]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchConversations(nextPage);
  };

  const getLastMessage = (conv: ChatwootConversation): string => {
    const msgs = conv.messages ?? [];
    if (msgs.length === 0) return "Sem mensagens";
    const last = msgs[msgs.length - 1];
    return last.content?.slice(0, 80) || "...";
  };

  const getTimeSince = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquare className="h-5 w-5" />
          Conversas Chatwoot
        </CardTitle>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={statusFilter === filter.value ? "default" : "outline"}
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? "bg-shark-blue hover:bg-shark-blue/90"
                  : ""
              }
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {conversations.length === 0 && !loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const sender = conv.meta?.sender;
              const aiStatus = aiStatusMap[conv.id];
              return (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-shark-blue/10 text-shark-blue font-medium">
                    {sender?.name?.charAt(0)?.toUpperCase() || "#"}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {sender?.name || `Conversa #${conv.id}`}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {conv.status}
                      </Badge>
                      {aiStatus && (
                        <Badge
                          variant={aiStatus === "active" ? "success" : "destructive"}
                          className="text-[10px]"
                        >
                          {aiStatus === "active" ? "IA" : "Humano"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {getLastMessage(conv)}
                    </p>
                  </div>

                  {/* Time */}
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {getTimeSince(conv.last_activity_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasMore && !loading && conversations.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={handleLoadMore}>
              Carregar mais
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
