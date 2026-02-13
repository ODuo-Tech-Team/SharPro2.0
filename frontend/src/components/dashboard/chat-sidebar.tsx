"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  chatwoot_inbox_id: number | null;
}

interface ChatSidebarProps {
  accountId: number;
  aiStatusMap: Record<number, string>;
  selectedConversationId: number | null;
  onSelectConversation: (id: number, contactName: string) => void;
  instances: WhatsAppInstance[];
  selectedInboxId: number | null;
  onInboxChange: (inboxId: number | null) => void;
}

const STATUS_FILTERS = [
  { label: "Aberto", value: "open" },
  { label: "Pendente", value: "pending" },
  { label: "Resolvido", value: "resolved" },
];

function getTimeSince(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function ChatSidebar({
  accountId,
  aiStatusMap,
  selectedConversationId,
  onSelectConversation,
  instances,
  selectedInboxId,
  onInboxChange,
}: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ChatwootConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");

  // Use refs to avoid stale closures in polling intervals
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;

  const selectedInboxIdRef = useRef(selectedInboxId);
  selectedInboxIdRef.current = selectedInboxId;

  const fetchConversations = useCallback(
    async (pageNum: number, reset: boolean = false) => {
      if (reset) setLoading(true);
      try {
        const currentStatus = statusFilterRef.current;
        const currentInboxId = selectedInboxIdRef.current;
        let url = `${"/backend-api"}/api/chatwoot/conversations/${accountId}?status=${currentStatus}&page=${pageNum}&_t=${Date.now()}`;
        if (currentInboxId) {
          url += `&inbox_id=${currentInboxId}`;
        }
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        const payload: ChatwootConversation[] = data.data?.payload ?? [];
        const meta = data.data?.meta ?? {};

        if (reset) {
          setConversations(payload);
        } else {
          setConversations((prev) => [...prev, ...payload]);
        }

        const allCount = meta.all_count ?? 0;
        setHasMore(payload.length > 0 && (reset ? payload.length : 0) < allCount);
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        setLoading(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    setPage(1);
    setConversations([]);
    fetchConversations(1, true);

    // Poll for updated conversations every 3s
    const interval = setInterval(() => fetchConversations(1, true), 3000);
    return () => clearInterval(interval);
  }, [statusFilter, selectedInboxId, accountId, fetchConversations]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchConversations(nextPage);
  };

  const getLastMessage = (conv: ChatwootConversation): string => {
    const msgs = conv.messages ?? [];
    if (msgs.length === 0) return "Sem mensagens";
    const last = msgs[msgs.length - 1];
    return last.content?.slice(0, 60) || "...";
  };

  const filtered = search
    ? conversations.filter((c) => {
        const name = c.meta?.sender?.name?.toLowerCase() ?? "";
        return name.includes(search.toLowerCase()) || String(c.id).includes(search);
      })
    : conversations;

  return (
    <div className="flex h-full flex-col border-r">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">Conversas</h2>
        {/* Instance selector */}
        <div className="mt-2">
          <div className="relative">
            <Smartphone className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={selectedInboxId ?? ""}
              onChange={(e) => onInboxChange(e.target.value ? Number(e.target.value) : null)}
              className="h-8 w-full appearance-none rounded-md border border-input bg-background pl-8 pr-3 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <option value="">Todos os numeros</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.chatwoot_inbox_id ?? ""}>
                  {inst.display_name || inst.instance_name}
                  {inst.phone_number ? ` (${inst.phone_number})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Status filters */}
        <div className="mt-2 flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={statusFilter === filter.value ? "default" : "outline"}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                "h-7 text-xs px-2.5",
                statusFilter === filter.value && "bg-shark-blue hover:bg-shark-blue/90"
              )}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        ) : (
          <div className="p-2">
            {filtered.map((conv) => {
              const sender = conv.meta?.sender;
              const aiStatus = aiStatusMap[conv.id];
              const isSelected = selectedConversationId === conv.id;
              const contactName = sender?.name || `Conversa #${conv.id}`;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id, contactName)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-shark-blue/10 border border-shark-blue/20"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                    isSelected
                      ? "bg-shark-blue text-white"
                      : "bg-shark-blue/10 text-shark-blue"
                  )}>
                    {sender?.name?.charAt(0)?.toUpperCase() || "#"}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {contactName}
                      </span>
                      {aiStatus && (
                        <Badge
                          variant={aiStatus === "active" ? "success" : "destructive"}
                          className="text-[9px] px-1.5 py-0"
                        >
                          {aiStatus === "active" ? "IA" : "H"}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {getLastMessage(conv)}
                    </p>
                  </div>

                  {/* Time */}
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {getTimeSince(conv.last_activity_at)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasMore && !loading && filtered.length > 0 && (
          <div className="flex justify-center px-2 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              className="h-7 text-xs w-full"
            >
              Carregar mais
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
