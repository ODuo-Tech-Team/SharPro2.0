"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Save,
  Sparkles,
  MessageSquare,
  SmilePlus,
  Globe,
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

const TONE_OPTIONS = [
  {
    value: "profissional",
    label: "Profissional",
    description: "Formal e direto ao ponto",
    emoji: "\u{1F4BC}",
  },
  {
    value: "amigavel",
    label: "Amigavel",
    description: "Cordial e acolhedor",
    emoji: "\u{1F60A}",
  },
  {
    value: "tecnico",
    label: "Tecnico",
    description: "Preciso e detalhado",
    emoji: "\u{1F527}",
  },
  {
    value: "descontraido",
    label: "Descontraido",
    description: "Leve e informal",
    emoji: "\u{1F60E}",
  },
];

const LENGTH_OPTIONS = [
  {
    value: "curta",
    label: "Curta",
    description: "1-2 frases diretas",
  },
  {
    value: "media",
    label: "Media",
    description: "Respostas equilibradas",
  },
  {
    value: "detalhada",
    label: "Detalhada",
    description: "Explicacoes completas",
  },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Portugues (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
];

export function PersonalityForm({ orgId, currentConfig }: PersonalityFormProps) {
  const [config, setConfig] = useState<AiConfig>({
    tone: currentConfig.tone || "profissional",
    response_length: currentConfig.response_length || "media",
    use_emojis: currentConfig.use_emojis ?? false,
    language: currentConfig.language || "pt-BR",
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
            Personalidade da IA
          </h1>
          <p className="text-slate-400">
            Configure como o assistente deve se comunicar com seus clientes.
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
          ) : saved ? (
            <Save className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {/* Tone */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-400" />
          <h2 className="text-base font-semibold text-white">
            Tom de Comunicacao
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TONE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateConfig("tone", option.value)}
              className={`rounded-xl border p-4 text-left transition-all ${
                config.tone === option.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
              }`}
            >
              <span className="text-2xl">{option.emoji}</span>
              <p className="mt-2 text-sm font-medium text-white">
                {option.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Response Length */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold text-white">
            Tamanho das Respostas
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {LENGTH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateConfig("response_length", option.value)}
              className={`rounded-xl border p-4 text-left transition-all ${
                config.response_length === option.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-medium text-white">{option.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Emojis + Language */}
      <div className="grid grid-cols-2 gap-4">
        {/* Emojis Toggle */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-2">
            <SmilePlus className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Emojis</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateConfig("use_emojis", !config.use_emojis)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                config.use_emojis ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  config.use_emojis ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-slate-300">
              {config.use_emojis
                ? "Usar emojis nas respostas"
                : "Sem emojis"}
            </span>
          </div>
        </div>

        {/* Language */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Idioma</h2>
          </div>
          <select
            value={config.language}
            onChange={(e) => updateConfig("language", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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
