import { createClient } from "@/lib/supabase/server";
import { FollowupContent } from "./followup-content";
import { MOCK_LEADS_CLIENT } from "@/lib/mock-leads";

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  conversion_value: number | null;
  lead_score: number;
  interest_tags: string[];
  origin: string;
  created_at: string;
  pipeline_status: string;
  ai_summary: string | null;
  estimated_value: number;
  last_contact_at: string;
  conversation_id: number | null;
}

async function getFollowupData(): Promise<{
  orgId: string;
  isSuperAdmin: boolean;
  leads: Lead[];
} | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, is_superadmin")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, name, phone, status, conversion_value, lead_score, interest_tags, origin, created_at, pipeline_status, ai_summary, estimated_value, last_contact_at, conversation_id"
    )
    .eq("organization_id", profile.organization_id)
    .order("last_contact_at", { ascending: false });

  const realLeads = (leads ?? []) as Lead[];
  const isSuperAdmin = profile.is_superadmin === true;
  // Super admin: always show real data (no mocks). Client: use mock fallback for demo.
  const finalLeads = realLeads.length > 0 ? realLeads : (isSuperAdmin ? [] : MOCK_LEADS_CLIENT as Lead[]);
  return {
    orgId: profile.organization_id,
    isSuperAdmin,
    leads: finalLeads,
  };
}

export default async function FollowupPage() {
  const data = await getFollowupData();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">
          Não foi possível carregar os dados de follow-up.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {data.isSuperAdmin ? "Follow-up de Reuniões" : "Follow-up de Vendas"}
        </h1>
        <p className="text-muted-foreground">
          {data.isSuperAdmin
            ? "Acompanhe os prospects, dados coletados pela IA e reuniões agendadas."
            : "Acompanhe o pipeline de vendas e os resumos gerados pela IA."}
        </p>
      </div>

      <FollowupContent orgId={data.orgId} initialLeads={data.leads} isSuperAdmin={data.isSuperAdmin} />
    </div>
  );
}
