import { createClient } from "@/lib/supabase/server";
import { LeadsTable } from "./leads-table";

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  conversion_value: number | null;
  created_at: string;
}

async function getLeads(): Promise<Lead[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return [];

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, phone, status, conversion_value, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  return (leads ?? []) as Lead[];
}

export default async function LeadsPage() {
  const leads = await getLeads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">
          Gerencie todos os seus leads capturados pela IA.
        </p>
      </div>

      <LeadsTable initialLeads={leads} />
    </div>
  );
}
