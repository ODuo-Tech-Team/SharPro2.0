import { createClient } from "@/lib/supabase/server";
import { CampaignsList } from "@/components/dashboard/campaigns-list";
import { CreateCampaign } from "@/components/dashboard/create-campaign";

async function getCampaignsData() {
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

  const { data: org } = await supabase
    .from("organizations")
    .select("chatwoot_account_id")
    .eq("id", orgId)
    .single();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return {
    orgId,
    accountId: org?.chatwoot_account_id ?? 0,
    campaigns: campaigns ?? [],
  };
}

export default async function CampaignsPage() {
  const data = await getCampaignsData();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-lg font-medium text-muted-foreground">
          Nao foi possivel carregar os dados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-muted-foreground">
            Gerencie campanhas de prospeccao ativa.
          </p>
        </div>
        <CreateCampaign accountId={data.accountId} />
      </div>

      <CampaignsList
        orgId={data.orgId}
        initialCampaigns={data.campaigns}
      />
    </div>
  );
}
