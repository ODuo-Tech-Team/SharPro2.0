import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

interface PlanInfo {
  id: string;
  name: string;
  max_users: number;
  max_connections: number;
  max_campaigns: number;
  max_leads: number;
  price_monthly: number;
}

interface OrgSettings {
  id: string;
  name: string;
  system_prompt: string | null;
  chatwoot_url: string | null;
  chatwoot_token: string | null;
  chatwoot_account_id: number | null;
  inbox_id: number | null;
  openai_api_key: string | null;
  plan_id: string | null;
  plans: PlanInfo | null;
}

interface UsageData {
  currentUsers: number;
  currentLeads: number;
  currentCampaigns: number;
}

async function getOrgSettings(): Promise<{
  settings: OrgSettings;
  usage: UsageData;
  allPlans: PlanInfo[];
} | null> {
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

  // Get org with plan join
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, system_prompt, chatwoot_url, chatwoot_token, chatwoot_account_id, inbox_id, openai_api_key, plan_id, plans(*)"
    )
    .eq("id", profile.organization_id)
    .single();

  if (!org) return null;

  // Get usage data
  const [usersRes, leadsRes, campaignsRes, allPlansRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("organization_id", profile.organization_id),
    supabase
      .from("leads")
      .select("id", { count: "exact" })
      .eq("organization_id", profile.organization_id),
    supabase
      .from("campaigns")
      .select("id", { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .in("status", ["active", "draft"]),
    supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("price_monthly", { ascending: true }),
  ]);

  return {
    settings: org as unknown as OrgSettings,
    usage: {
      currentUsers: usersRes.count ?? 0,
      currentLeads: leadsRes.count ?? 0,
      currentCampaigns: campaignsRes.count ?? 0,
    },
    allPlans: (allPlansRes.data ?? []) as PlanInfo[],
  };
}

export default async function SettingsPage() {
  const data = await getOrgSettings();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Organizacao nao encontrada.
          </p>
          <p className="text-sm text-muted-foreground">
            Entre em contato com o suporte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">
          Ajuste as configuracoes da sua organizacao e personalidade da IA.
        </p>
      </div>

      <SettingsForm
        settings={data.settings}
        usage={data.usage}
        allPlans={data.allPlans}
      />
    </div>
  );
}
