"use client";

import { useState, useCallback } from "react";
import { ChatSidebar } from "@/components/dashboard/chat-sidebar";
import { ChatMessages } from "@/components/dashboard/chat-messages";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  chatwoot_inbox_id: number | null;
}

interface ChatLayoutProps {
  accountId: number;
  aiStatusMap: Record<number, string>;
  instances: WhatsAppInstance[];
  allowedInboxIds?: number[] | null;
}

export function ChatLayout({ accountId, aiStatusMap, instances, allowedInboxIds }: ChatLayoutProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [contactName, setContactName] = useState("");
  const [localAiStatusMap, setLocalAiStatusMap] = useState<Record<number, string>>(aiStatusMap);

  // Filter instances based on allowedInboxIds
  const visibleInstances = allowedInboxIds
    ? instances.filter((inst) => inst.chatwoot_inbox_id && allowedInboxIds.includes(inst.chatwoot_inbox_id))
    : instances;

  // Auto-select inbox if user has exactly one allowed inbox
  const defaultInboxId = allowedInboxIds && allowedInboxIds.length === 1 ? allowedInboxIds[0] : null;
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(defaultInboxId);

  const handleSelectConversation = (id: number, name: string) => {
    setSelectedConversationId(id);
    setContactName(name);
  };

  const handleInboxChange = (inboxId: number | null) => {
    setSelectedInboxId(inboxId);
    setSelectedConversationId(null);
    setContactName("");
  };

  const handleAiStatusChange = useCallback((convId: number, newStatus: string) => {
    setLocalAiStatusMap((prev) => ({ ...prev, [convId]: newStatus }));
  }, []);

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-background">
      {/* Sidebar - conversation list */}
      <div className="w-[350px] shrink-0">
        <ChatSidebar
          accountId={accountId}
          aiStatusMap={localAiStatusMap}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          instances={visibleInstances}
          selectedInboxId={selectedInboxId}
          onInboxChange={handleInboxChange}
          allowedInboxIds={allowedInboxIds}
        />
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-h-0">
        <ChatMessages
          accountId={accountId}
          conversationId={selectedConversationId}
          contactName={contactName}
          aiStatus={selectedConversationId ? localAiStatusMap[selectedConversationId] : undefined}
          onAiStatusChange={handleAiStatusChange}
        />
      </div>
    </div>
  );
}
