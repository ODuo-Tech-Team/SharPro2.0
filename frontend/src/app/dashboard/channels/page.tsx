import { createClient } from "@/lib/supabase/server";
import { ChannelsList } from "@/components/dashboard/channels-list";

interface PlanInfo {
  max_connections: number;
}

async function getChannelsData() {
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

  const { data: org } = await supabase
    .from("organizations")
    .select("chatwoot_account_id, plans(max_connections)")
    .eq("id", profile.organization_id)
    .single();

  if (!org) return null;

  return {
    accountId: org.chatwoot_account_id as number | null,
    plan: (org.plans as unknown as PlanInfo) ?? null,
  };
}

export default async function ChannelsPage() {
  const data = await getChannelsData();

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Canais</h1>
        <p className="text-muted-foreground">
          Gerencie suas conexoes WhatsApp e adicione novos numeros.
        </p>
      </div>

      <ChannelsList accountId={data.accountId} plan={data.plan} />
    </div>
  );
}
