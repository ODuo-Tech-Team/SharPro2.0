import { createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "@/components/dashboard/feedback-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
}

async function getFeedbackData() {
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

  const { data: feedbacks } = await supabase
    .from("feedback")
    .select("id, type, title, description, status, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return {
    orgId,
    userId: user.id,
    feedbacks: (feedbacks ?? []) as FeedbackItem[],
  };
}

const typeLabels: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  question: "Pergunta",
  other: "Outro",
};

const typeColors: Record<string, string> = {
  bug: "destructive",
  feature: "info",
  question: "warning",
  other: "secondary",
};

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  resolved: "Resolvido",
  closed: "Fechado",
};

export default async function FeedbackPage() {
  const data = await getFeedbackData();

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
          <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
          <p className="text-muted-foreground">
            Envie sugestoes, reporte bugs ou faca perguntas.
          </p>
        </div>
        <FeedbackForm orgId={data.orgId} userId={data.userId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Seus Feedbacks ({data.feedbacks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.feedbacks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum feedback enviado ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {data.feedbacks.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={typeColors[item.type] as any || "secondary"}>
                      {typeLabels[item.type] || item.type}
                    </Badge>
                    <Badge variant="outline">
                      {statusLabels[item.status] || item.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <h3 className="font-medium">{item.title}</h3>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
