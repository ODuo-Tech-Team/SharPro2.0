"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Pause, ExternalLink, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { EditCampaign } from "@/components/dashboard/edit-campaign";

interface Campaign {
  id: string;
  name: string;
  status: string;
  template_message: string;
  send_interval_seconds: number;
  total_leads: number;
  sent_count: number;
  replied_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface CampaignsListProps {
  orgId: string;
  initialCampaigns: Campaign[];
}

const statusColors: Record<string, string> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "info",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluida",
};

export function CampaignsList({ orgId, initialCampaigns }: CampaignsListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`campaigns-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaigns",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCampaigns((prev) => [payload.new as Campaign, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Campaign;
            setCampaigns((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const handleAction = async (campaignId: string, action: "start" | "pause") => {
    setLoadingAction(campaignId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns/${campaignId}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`Failed to ${action} campaign`);
    } catch (err) {
      console.error(`Error ${action} campaign:`, err);
    } finally {
      setLoadingAction(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-sm text-muted-foreground">
            Nenhuma campanha criada ainda. Crie sua primeira campanha para comecar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => {
        const progress =
          campaign.total_leads > 0
            ? Math.round((campaign.sent_count / campaign.total_leads) * 100)
            : 0;

        return (
          <Card key={campaign.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold truncate">
                  {campaign.name}
                </CardTitle>
                <Badge
                  variant={statusColors[campaign.status] as any || "secondary"}
                >
                  {statusLabels[campaign.status] || campaign.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">
                    {campaign.sent_count}/{campaign.total_leads}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Enviadas: </span>
                  <span className="font-medium">{campaign.sent_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Respostas: </span>
                  <span className="font-medium">{campaign.replied_count}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Criada em {formatDate(campaign.created_at)}
              </p>

              <div className="flex gap-2">
                {campaign.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingCampaign(campaign)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                )}
                {(campaign.status === "draft" || campaign.status === "paused") && (
                  <Button
                    size="sm"
                    className="bg-shark-blue hover:bg-shark-blue/90"
                    onClick={() => handleAction(campaign.id, "start")}
                    disabled={loadingAction === campaign.id || campaign.total_leads === 0}
                  >
                    {loadingAction === campaign.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="mr-1 h-3 w-3" />
                        Iniciar
                      </>
                    )}
                  </Button>
                )}
                {campaign.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(campaign.id, "pause")}
                    disabled={loadingAction === campaign.id}
                  >
                    {loadingAction === campaign.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Pause className="mr-1 h-3 w-3" />
                        Pausar
                      </>
                    )}
                  </Button>
                )}
                <Link href={`/dashboard/campaigns/${campaign.id}`}>
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Detalhes
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    {editingCampaign && (
      <EditCampaign
        campaign={editingCampaign}
        open={!!editingCampaign}
        onOpenChange={(open) => {
          if (!open) setEditingCampaign(null);
        }}
      />
    )}
    </>
  );
}
