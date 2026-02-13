import { createClient } from "@/lib/supabase/server";
import { SimulatorContent } from "./simulator-content";

async function getSimulatorData(): Promise<{
  orgId: string;
  accountId: number;
  orgName: string;
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

  const { data: org } = await supabase
    .from("organizations")
    .select("chatwoot_account_id, name")
    .eq("id", profile.organization_id)
    .single();

  return {
    orgId: profile.organization_id,
    accountId: org?.chatwoot_account_id ?? 0,
    orgName: org?.name ?? "Empresa",
  };
}

export default async function SimulatorPage() {
  const data = await getSimulatorData();

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
    <SimulatorContent
      orgId={data.orgId}
      accountId={data.accountId}
      orgName={data.orgName}
    />
  );
}
