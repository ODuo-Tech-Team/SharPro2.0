import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

interface OrgSettings {
  id: string;
  name: string;
  system_prompt: string | null;
  chatwoot_url: string | null;
  chatwoot_token: string | null;
  chatwoot_account_id: number | null;
  inbox_id: number | null;
  openai_api_key: string | null;
}

async function getOrgSettings(): Promise<OrgSettings | null> {
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
    .select(
      "id, name, system_prompt, chatwoot_url, chatwoot_token, chatwoot_account_id, inbox_id, openai_api_key"
    )
    .eq("id", profile.organization_id)
    .single();

  return org as OrgSettings | null;
}

export default async function SettingsPage() {
  const settings = await getOrgSettings();

  if (!settings) {
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

      <SettingsForm settings={settings} />
    </div>
  );
}
