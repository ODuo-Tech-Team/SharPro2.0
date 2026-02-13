"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Play,
  Pause,
  CheckCircle,
  Settings,
  Loader2,
  Trash2,
} from "lucide-react";
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

function getStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case "active":
    case "running":
      return <Play className="h-5 w-5" />;
    case "paused":
      return <Pause className="h-5 w-5" />;
    case "completed":
      return <CheckCircle className="h-5 w-5" />;
    case "draft":
    default:
      return <Settings className="h-5 w-5" />;
  }
}

function getStatusStyle(status: string): string {
  switch (status) {
    case "active":
    case "running":
      return "bg-blue-500/10 text-blue-400";
    case "paused":
      return "bg-amber-500/10 text-amber-400";
    case "completed":
      return "bg-slate-800 text-slate-400";
    case "draft":
    default:
      return "bg-slate-800 text-slate-400";
  }
}

export function CampaignsList({ orgId, initialCampaigns }: CampaignsListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (payload.eventType === "INSERT") {
            setCampaigns((prev) => [payload.new as unknown as Campaign, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as Campaign;
            setCampaigns((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as unknown as Campaign;
            setCampaigns((prev) => prev.filter((c) => c.id !== deleted.id));
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
        `${"/backend-api"}/api/campaigns/${campaignId}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`Failed to ${action} campaign`);
    } catch (err) {
      console.error(`Error ${action} campaign:`, err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async (campaignId: string) => {
    setDeletingId(campaignId);
    try {
      const res = await fetch(
        `${"/backend-api"}/api/campaigns/${campaignId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao excluir campanha");
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
    } catch (err) {
      console.error("Error deleting campaign:", err);
      alert(err instanceof Error ? err.message : "Erro ao excluir campanha");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-sm">
            Nenhuma campanha criada ainda. Crie sua primeira campanha para começar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {campaigns.map((campaign) => {
          const statusBg = getStatusStyle(campaign.status);
          const statusIcon = getStatusIcon(campaign.status);
          const sentCount = campaign.sent_count ?? 0;
          const conversionPercent =
            campaign.replied_count && campaign.sent_count
              ? Math.round((campaign.replied_count / campaign.sent_count) * 100)
              : 0;
          const isConfirmingDelete = confirmDeleteId === campaign.id;

          return (
            <div
              key={campaign.id}
              className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4"
            >
              {/* Left: Icon + Name */}
              <div className="flex items-center gap-4 flex-1">
                <div className={`p-3 rounded-lg ${statusBg}`}>
                  {statusIcon}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{campaign.name}</h3>
                  <p className="text-slate-500 text-sm">
                    Lista de contatos &bull; {campaign.total_leads} contatos
                  </p>
                </div>
              </div>

              {/* Middle: Metrics */}
              <div className="flex items-center gap-8 px-4 border-l border-slate-800">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{sentCount}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">
                    Enviados
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {conversionPercent}%
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">
                    Conversão
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex gap-2">
                {campaign.status === "active" && (
                  <button
                    className="p-2 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    onClick={() => handleAction(campaign.id, "pause")}
                    disabled={loadingAction === campaign.id}
                    title="Pausar"
                  >
                    {loadingAction === campaign.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>
                )}
                {(campaign.status === "paused" || campaign.status === "draft") && (
                  <button
                    className="p-2 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    onClick={() => handleAction(campaign.id, "start")}
                    disabled={
                      loadingAction === campaign.id || campaign.total_leads === 0
                    }
                    title="Iniciar"
                  >
                    {loadingAction === campaign.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  className="p-2 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  onClick={() => setEditingCampaign(campaign)}
                  title="Configurações"
                >
                  <Settings className="h-4 w-4" />
                </button>

                {/* Delete button */}
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="px-2 py-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
                      onClick={() => handleDelete(campaign.id)}
                      disabled={deletingId === campaign.id}
                    >
                      {deletingId === campaign.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Confirmar"
                      )}
                    </button>
                    <button
                      className="px-2 py-1 text-xs text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    className="p-2 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors"
                    onClick={() => setConfirmDeleteId(campaign.id)}
                    disabled={campaign.status === "active"}
                    title={campaign.status === "active" ? "Pause a campanha antes de excluir" : "Excluir campanha"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingCampaign && (
        <EditCampaign
          campaign={editingCampaign}
          open={!!editingCampaign}
          onOpenChange={(open: boolean) => {
            if (!open) setEditingCampaign(null);
          }}
        />
      )}
    </>
  );
}
