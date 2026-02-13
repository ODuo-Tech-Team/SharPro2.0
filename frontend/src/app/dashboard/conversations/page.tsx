import { createClient } from "@/lib/supabase/server";
import { ChatLayout } from "@/components/dashboard/chat-layout";

interface ConversationRow {
  id: string;
  conversation_id: number;
  ai_status: string;
}

export interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  chatwoot_inbox_id: number | null;
}

async function getConversationsData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const orgId = profile.organization_id;

  const [conversationsResult, orgResult, instancesResult, userInstancesResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, conversation_id, ai_status")
      .eq("organization_id", orgId),
    supabase
      .from("organizations")
      .select("chatwoot_account_id")
      .eq("id", orgId)
      .single(),
    supabase
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, phone_number, status, chatwoot_inbox_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("user_instances")
      .select("instance_id, whatsapp_instances!inner(chatwoot_inbox_id)")
      .eq("user_id", user.id),
  ]);

  const conversations = conversationsResult.data ?? [];
  const accountId = orgResult.data?.chatwoot_account_id ?? null;
  const instances: WhatsAppInstance[] = instancesResult.data ?? [];

  // Compute allowedInboxIds: if user is NOT admin AND has instance assignments, filter
  let allowedInboxIds: number[] | null = null;
  const userInstances = userInstancesResult.data ?? [];
  if (profile.role !== "admin" && userInstances.length > 0) {
    allowedInboxIds = userInstances
      .map((ui: any) => ui.whatsapp_instances?.chatwoot_inbox_id)
      .filter((id: any): id is number => id != null)
      .map(Number);
  }

  // Build ai_status map keyed by conversation_id
  const aiStatusMap: Record<number, string> = {};
  conversations.forEach((c: ConversationRow) => {
    aiStatusMap[c.conversation_id] = c.ai_status;
  });

  return { orgId, accountId, aiStatusMap, instances, allowedInboxIds };
}

export default async function ConversationsPage() {
  const data = await getConversationsData();

  if (!data || !data.accountId) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Não foi possível carregar os dados.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique se o Chatwoot está configurado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout
      accountId={data.accountId}
      aiStatusMap={data.aiStatusMap}
      instances={data.instances}
      allowedInboxIds={data.allowedInboxIds}
    />
  );
}
