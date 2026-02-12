import { createClient } from "@/lib/supabase/server";
import { TrainingContent } from "./training-content";

interface KnowledgeFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: string;
  content: string | null;
  created_at: string;
}

async function getTrainingData(): Promise<{
  orgId: string;
  accountId: number;
  files: KnowledgeFile[];
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
    .select("chatwoot_account_id")
    .eq("id", profile.organization_id)
    .single();

  const { data: files } = await supabase
    .from("knowledge_files")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  return {
    orgId: profile.organization_id,
    accountId: org?.chatwoot_account_id ?? 0,
    files: (files ?? []) as KnowledgeFile[],
  };
}

export default async function TrainingPage() {
  const data = await getTrainingData();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">
          Não foi possível carregar os dados.
        </p>
      </div>
    );
  }

  return (
    <TrainingContent
      orgId={data.orgId}
      accountId={data.accountId}
      initialFiles={data.files}
    />
  );
}
