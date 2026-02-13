"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  accountId: number;
  conversationId: number;
  onMessageSent?: () => void;
}

export function ChatInput({
  accountId,
  conversationId,
  onMessageSent,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Always keep focus on textarea
  useEffect(() => {
    textareaRef.current?.focus();
  });

  const handleSend = useCallback(async () => {
    const content = message.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `${"/backend-api"}/api/chatwoot/conversations/${accountId}/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) throw new Error("Failed to send");
      setMessage("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      onMessageSent?.();
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSending(false);
    }
  }, [message, sending, accountId, conversationId, onMessageSent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t bg-background p-4">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = target.scrollHeight + "px";
        }}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem..."
        disabled={sending}
        rows={1}
        className="flex-1 resize-none overflow-hidden rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        style={{ minHeight: "40px" }}
      />
      <Button
        size="icon"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="h-10 w-10 shrink-0 bg-shark-blue hover:bg-shark-blue/90"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
