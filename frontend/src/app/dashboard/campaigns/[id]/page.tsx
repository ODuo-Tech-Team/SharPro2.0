import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface CampaignDetailPageProps {
  params: Promise<{ id: string }>;
}

const leadStatusLabels: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviada",
  replied: "Respondeu",
  failed: "Falhou",
  skipped: "Ignorado",
};

const leadStatusColors: Record<string, string> = {
  pending: "secondary",
  sent: "info",
  replied: "success",
  failed: "destructive",
  skipped: "outline",
};

async function getCampaignDetail(id: string) {
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!campaign) return null;

  const { data: leads } = await supabase
    .from("campaign_leads")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  return {
    campaign,
    leads: leads ?? [],
  };
}

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const { id } = await params;
  const data = await getCampaignDetail(id);

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-lg font-medium text-muted-foreground">
          Campanha não encontrada.
        </p>
      </div>
    );
  }

  const { campaign, leads } = data;
  const progress =
    campaign.total_leads > 0
      ? Math.round((campaign.sent_count / campaign.total_leads) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/campaigns"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Campanhas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={campaign.status === "active" ? "success" : "secondary"}>
            {campaign.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Criada em {formatDate(campaign.created_at)}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{campaign.total_leads}</div>
            <p className="text-xs text-muted-foreground">Total de Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-shark-blue">{campaign.sent_count}</div>
            <p className="text-xs text-muted-foreground">Enviadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-500">{campaign.replied_count}</div>
            <p className="text-xs text-muted-foreground">Respostas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{progress}%</div>
            <Progress value={progress} className="mt-2 h-2" />
            <p className="mt-1 text-xs text-muted-foreground">Progresso</p>
          </CardContent>
        </Card>
      </div>

      {/* Template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagem Template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm font-mono">
            {campaign.template_message}
          </p>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Leads ({leads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum lead importado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviada</TableHead>
                  <TableHead>Respondeu</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {lead.phone}
                    </TableCell>
                    <TableCell>
                      <Badge variant={leadStatusColors[lead.status] as any || "secondary"}>
                        {leadStatusLabels[lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.sent_at ? formatDate(lead.sent_at) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.replied_at ? formatDate(lead.replied_at) : "-"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                      {lead.error_message || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
