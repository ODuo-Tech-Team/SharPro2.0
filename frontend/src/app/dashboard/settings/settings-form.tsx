"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Bot, Key, Crown, Users, Target, Megaphone } from "lucide-react";

interface PlanInfo {
  id: string;
  name: string;
  max_users: number;
  max_connections: number;
  max_campaigns: number;
  max_leads: number;
  price_monthly: number;
}

interface OrgSettings {
  id: string;
  name: string;
  system_prompt: string | null;
  openai_api_key: string | null;
  plan_id: string | null;
  plans: PlanInfo | null;
}

interface UsageData {
  currentUsers: number;
  currentLeads: number;
  currentCampaigns: number;
}

interface SettingsFormProps {
  settings: OrgSettings;
  usage: UsageData;
  allPlans: PlanInfo[];
}

function UsageMeter({
  label,
  icon: Icon,
  current,
  max,
}: {
  label: string;
  icon: React.ElementType;
  current: number;
  max: number;
}) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 0 : max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className={`font-medium ${isNearLimit ? "text-orange-500" : ""}`}>
          {current}/{isUnlimited ? "Ilimitado" : max}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={`h-2 ${isNearLimit ? "[&>div]:bg-orange-500" : ""}`}
        />
      )}
    </div>
  );
}

export function SettingsForm({ settings, usage, allPlans }: SettingsFormProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [systemPrompt, setSystemPrompt] = useState(
    settings.system_prompt ?? ""
  );
  const [openaiKey, setOpenaiKey] = useState(settings.openai_api_key ?? "");
  const [saving, setSaving] = useState(false);

  const plan = settings.plans;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("organizations")
      .update({
        system_prompt: systemPrompt || null,
        openai_api_key: openaiKey || null,
      })
      .eq("id", settings.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Erro ao salvar",
        description:
          error.message || "Nao foi possivel atualizar as configuracoes.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Configuracoes salvas",
      description: "As alteracoes foram aplicadas com sucesso.",
      variant: "success",
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Seu Plano</CardTitle>
                {plan && (
                  <Badge variant="outline" className="font-semibold">
                    {plan.name}
                  </Badge>
                )}
              </div>
              <CardDescription>
                {plan
                  ? `R$ ${plan.price_monthly.toFixed(2)}/mes`
                  : "Nenhum plano configurado"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan && (
            <>
              <div className="space-y-3">
                <UsageMeter
                  label="Usuarios"
                  icon={Users}
                  current={usage.currentUsers}
                  max={plan.max_users}
                />
                <UsageMeter
                  label="Leads"
                  icon={Target}
                  current={usage.currentLeads}
                  max={plan.max_leads}
                />
                <UsageMeter
                  label="Campanhas"
                  icon={Megaphone}
                  current={usage.currentCampaigns}
                  max={plan.max_campaigns}
                />
              </div>

            </>
          )}
        </CardContent>
      </Card>

      {/* AI Personality */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-shark-blue" />
            <div>
              <CardTitle className="text-lg">Personalidade da IA</CardTitle>
              <CardDescription>
                Defina como o assistente de IA deve se comportar e responder aos
                clientes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="system_prompt">System Prompt</Label>
            <Textarea
              id="system_prompt"
              placeholder="Voce e um assistente de vendas profissional e amigavel..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              className="resize-y font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Este prompt define a personalidade e as instrucoes base da IA para
              todas as conversas da sua organizacao.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* OpenAI Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-purple-500" />
            <div>
              <CardTitle className="text-lg">OpenAI</CardTitle>
              <CardDescription>
                Chave de API para acesso aos modelos GPT e Whisper.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="openai_key">Chave da API</Label>
            <Input
              id="openai_key"
              type="password"
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sua chave e armazenada de forma segura e usada apenas para
              processar mensagens da sua organizacao.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          className="bg-shark-blue hover:bg-shark-blue/90"
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configuracoes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
