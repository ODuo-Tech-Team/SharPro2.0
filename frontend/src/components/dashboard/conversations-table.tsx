"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Bot, UserCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useRealtimeConversations } from "@/hooks/use-realtime";

interface ConversationRow {
  id: string;
  conversation_id: number;
  contact_id: number | null;
  ai_status: string;
  status: string;
  updated_at: string;
}

interface ConversationsTableProps {
  orgId: string;
  initialConversations: ConversationRow[];
  accountId: number | null;
}

export function ConversationsTable({
  orgId,
  initialConversations,
  accountId,
}: ConversationsTableProps) {
  const conversations = useRealtimeConversations(orgId, initialConversations);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleReactivate = async (conversationId: number) => {
    setLoadingId(conversationId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}/reactivate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to reactivate");
    } catch (err) {
      console.error("Reactivate error:", err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Conversas Rastreadas ({conversations.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {conversations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa rastreada ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversa ID</TableHead>
                <TableHead>Contato ID</TableHead>
                <TableHead>Status IA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Acao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell className="font-mono font-medium">
                    #{conv.conversation_id}
                  </TableCell>
                  <TableCell>
                    {conv.contact_id ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={conv.ai_status === "active" ? "success" : "destructive"}
                      className="gap-1"
                    >
                      {conv.ai_status === "active" ? (
                        <Bot className="h-3 w-3" />
                      ) : (
                        <UserCheck className="h-3 w-3" />
                      )}
                      {conv.ai_status === "active" ? "IA Ativa" : "Pausada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {conv.status === "bot" ? "Bot" : "Humano"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(conv.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {conv.ai_status === "paused" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReactivate(conv.conversation_id)}
                        disabled={loadingId === conv.conversation_id}
                      >
                        {loadingId === conv.conversation_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Reativar IA"
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
