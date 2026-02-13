"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, FileText, FlaskConical } from "lucide-react";
import { PersonalityForm } from "@/app/dashboard/personality/personality-form";
import { TrainingContent } from "@/app/dashboard/training/training-content";
import { SimulatorContent } from "@/app/dashboard/simulator/simulator-content";

interface AiConfig {
  tone?: string;
  response_length?: string;
  use_emojis?: boolean;
  language?: string;
  business_hours?: {
    start?: string;
    end?: string;
    timezone?: string;
  };
  outside_hours_message?: string;
}

interface KnowledgeFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: string;
  content: string | null;
  created_at: string;
}

interface BotContentProps {
  orgId: string;
  accountId: number;
  orgName: string;
  aiConfig: AiConfig;
  initialFiles: KnowledgeFile[];
}

const tabs = [
  { id: "personality", label: "Personalidade", icon: Sparkles },
  { id: "training", label: "Base de Conhecimento", icon: FileText },
  { id: "test", label: "Testar Chat", icon: FlaskConical },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function BotContent({
  orgId,
  accountId,
  orgName,
  aiConfig,
  initialFiles,
}: BotContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>("personality");

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col -mx-6 -mt-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 px-6 pt-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-shark-blue bg-shark-blue/10 text-shark-blue"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "personality" && (
          <div className="p-6">
            <PersonalityForm orgId={orgId} currentConfig={aiConfig} />
          </div>
        )}
        {activeTab === "training" && (
          <div className="p-6">
            <TrainingContent
              orgId={orgId}
              accountId={accountId}
              initialFiles={initialFiles}
            />
          </div>
        )}
        {activeTab === "test" && (
          <div className="flex h-full flex-col">
            <SimulatorContent
              orgId={orgId}
              accountId={accountId}
              orgName={orgName}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  );
}
