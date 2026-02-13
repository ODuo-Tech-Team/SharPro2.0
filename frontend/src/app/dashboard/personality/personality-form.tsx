"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Save,
  Clock,
  MessageCircle,
} from "lucide-react";

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

interface PersonalityFormProps {
  orgId: string;
  currentConfig: AiConfig;
}

export function PersonalityForm({ orgId, currentConfig }: PersonalityFormProps) {
  const [config, setConfig] = useState<AiConfig>({
    ...currentConfig,
    business_hours: currentConfig.business_hours || {
      start: "",
      end: "",
      timezone: "America/Sao_Paulo",
    },
    outside_hours_message: currentConfig.outside_hours_message || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const updateBusinessHours = (key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      business_hours: { ...prev.business_hours, [key]: value },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organizations")
        .update({ ai_config: config })
        .eq("id", orgId);

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save error:", err);
      alert("Erro ao salvar configuracoes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Configuracoes da IA
          </h1>
          <p className="text-slate-400">
            Configure o horario de atendimento e a mensagem fora do expediente.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {/* Business Hours */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-sky-400" />
          <h2 className="text-base font-semibold text-white">
            Horario de Atendimento
          </h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Fora do horario, a IA envia uma mensagem automatica.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Inicio
            </label>
            <input
              type="time"
              value={config.business_hours?.start || ""}
              onChange={(e) => updateBusinessHours("start", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Fim</label>
            <input
              type="time"
              value={config.business_hours?.end || ""}
              onChange={(e) => updateBusinessHours("end", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Fuso Horario
            </label>
            <select
              value={config.business_hours?.timezone || "America/Sao_Paulo"}
              onChange={(e) => updateBusinessHours("timezone", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="America/Sao_Paulo">Brasilia (GMT-3)</option>
              <option value="America/Manaus">Manaus (GMT-4)</option>
              <option value="America/Noronha">Noronha (GMT-2)</option>
              <option value="America/Rio_Branco">Rio Branco (GMT-5)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Outside Hours Message */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-orange-400" />
          <h2 className="text-base font-semibold text-white">
            Mensagem Fora do Horario
          </h2>
        </div>
        <textarea
          value={config.outside_hours_message}
          onChange={(e) =>
            updateConfig("outside_hours_message", e.target.value)
          }
          placeholder="Obrigado pelo contato! Nosso horario de atendimento e de 08:00 as 18:00. Retornaremos em breve!"
          rows={3}
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
