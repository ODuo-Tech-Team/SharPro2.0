import { createClient } from "@/lib/supabase/server";
import { ChatLayout } from "@/components/dashboard/chat-layout";

interface ConversationRow {
  id: string;
  conversation_id: number;
  ai_status: string;
}

async function getConversationsData() {
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

  const [conversationsResult, orgResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, conversation_id, ai_status")
      .eq("organization_id", orgId),
    supabase
      .from("organizations")
      .select("chatwoot_account_id")
      .eq("id", orgId)
      .single(),
  ]);

  const conversations = conversationsResult.data ?? [];
  const accountId = orgResult.data?.chatwoot_account_id ?? null;

  // Build ai_status map keyed by conversation_id
  const aiStatusMap: Record<number, string> = {};
  conversations.forEach((c: ConversationRow) => {
    aiStatusMap[c.conversation_id] = c.ai_status;
  });

  return { orgId, accountId, aiStatusMap };
}

export default async function ConversationsPage() {
  const data = await getConversationsData();

  if (!data || !data.accountId) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Nao foi possivel carregar os dados.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique se o Chatwoot esta configurado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout
      accountId={data.accountId}
      aiStatusMap={data.aiStatusMap}
    />
  );
}
