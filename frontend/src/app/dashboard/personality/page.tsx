import { createClient } from "@/lib/supabase/server";
import { PersonalityForm } from "./personality-form";

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

async function getPersonalityData(): Promise<{
  orgId: string;
  currentConfig: AiConfig;
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
    .select("ai_config")
    .eq("id", profile.organization_id)
    .single();

  return {
    orgId: profile.organization_id,
    currentConfig: (org?.ai_config as AiConfig) ?? {},
  };
}

export default async function PersonalityPage() {
  const data = await getPersonalityData();

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
    <PersonalityForm orgId={data.orgId} currentConfig={data.currentConfig} />
  );
}
