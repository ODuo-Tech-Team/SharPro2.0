import { createClient } from "@/lib/supabase/server";
import { BotContent } from "./bot-content";

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

async function getBotData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const orgId = profile.organization_id;

  const [orgResult, filesResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("chatwoot_account_id, name, ai_config")
      .eq("id", orgId)
      .single(),
    supabase
      .from("knowledge_files")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    orgId,
    accountId: orgResult.data?.chatwoot_account_id ?? 0,
    orgName: orgResult.data?.name ?? "Empresa",
    aiConfig: (orgResult.data?.ai_config as AiConfig) ?? {},
    files: (filesResult.data ?? []) as KnowledgeFile[],
  };
}

export default async function BotPage() {
  const data = await getBotData();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">
          Nao foi possivel carregar os dados.
        </p>
      </div>
    );
  }

  return (
    <BotContent
      orgId={data.orgId}
      accountId={data.accountId}
      orgName={data.orgName}
      aiConfig={data.aiConfig}
      initialFiles={data.files}
    />
  );
}
