"use client";

import { useState } from "react";
import { ChatSidebar } from "@/components/dashboard/chat-sidebar";
import { ChatMessages } from "@/components/dashboard/chat-messages";

interface ChatLayoutProps {
  accountId: number;
  aiStatusMap: Record<number, string>;
}

export function ChatLayout({ accountId, aiStatusMap }: ChatLayoutProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [contactName, setContactName] = useState("");

  const handleSelectConversation = (id: number, name: string) => {
    setSelectedConversationId(id);
    setContactName(name);
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
