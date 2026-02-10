"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Bot, Link2, Key } from "lucide-react";

interface OrgSettings {
  id: string;
  name: string;
  system_prompt: string | null;
  chatwoot_url: string | null;
  chatwoot_token: string | null;
  openai_api_key: string | null;
}

interface SettingsFormProps {
  settings: OrgSettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [systemPrompt, setSystemPrompt] = useState(
    settings.system_prompt ?? ""
  );
  const [chatwootUrl, setChatwootUrl] = useState(settings.chatwoot_url ?? "");
  const [chatwootToken, setChatwootToken] = useState(
    settings.chatwoot_token ?? ""
  );
  const [openaiKey, setOpenaiKey] = useState(settings.openai_api_key ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("organizations")
      .update({
        system_prompt: systemPrompt || null,
        chatwoot_url: chatwootUrl || null,
        chatwoot_token: chatwootToken || null,
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

      {/* Chatwoot Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-shark-accent" />
            <div>
              <CardTitle className="text-lg">Integracao Chatwoot</CardTitle>
              <CardDescription>
                Configure a conexao com sua instancia do Chatwoot.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chatwoot_url">URL do Chatwoot</Label>
            <Input
              id="chatwoot_url"
              type="url"
              placeholder="https://app.chatwoot.com"
              value={chatwootUrl}
              onChange={(e) => setChatwootUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chatwoot_token">Token de Acesso</Label>
            <Input
              id="chatwoot_token"
              type="text"
              placeholder="Seu token da API Chatwoot"
              value={chatwootToken}
              onChange={(e) => setChatwootToken(e.target.value)}
            />
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
