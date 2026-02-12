"use client";

import { useState } from "react";
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
}

export function ChatLayout({ accountId, aiStatusMap, instances }: ChatLayoutProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [contactName, setContactName] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);

  const handleSelectConversation = (id: number, name: string) => {
    setSelectedConversationId(id);
    setContactName(name);
  };

  const handleInboxChange = (inboxId: number | null) => {
    setSelectedInboxId(inboxId);
    // Clear selected conversation when inbox changes
    setSelectedConversationId(null);
    setContactName("");
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-background">
      {/* Sidebar - conversation list */}
      <div className="w-[350px] shrink-0">
        <ChatSidebar
          accountId={accountId}
          aiStatusMap={aiStatusMap}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          instances={instances}
          selectedInboxId={selectedInboxId}
          onInboxChange={handleInboxChange}
        />
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-h-0">
        <ChatMessages
          accountId={accountId}
          conversationId={selectedConversationId}
          contactName={contactName}
          aiStatus={selectedConversationId ? aiStatusMap[selectedConversationId] : undefined}
        />
      </div>
    </div>
  );
}
