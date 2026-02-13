"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { AdminInstances } from "@/components/admin/admin-instances";

interface Organization {
  id: string;
  name: string;
  is_active?: boolean;
  plan_id?: string;
  system_prompt?: string;
  openai_api_key?: string;
  chatwoot_account_id?: number;
  chatwoot_url?: string;
  chatwoot_token?: string;
  inbox_id?: number;
  plans?: { id: string; name: string } | null;
  owner?: { id: string; email: string; full_name?: string } | null;
  [key: string]: any;
}

interface Plan {
  id: string;
  name: string;
  [key: string]: any;
}

interface EditClientModalProps {
  organization: Organization;
  plans: Plan[];
  accessToken: string;
  open: boolean;
  onClose: () => void;
}

export function EditClientModal({
  organization,
  plans,
  accessToken,
  open,
  onClose,
}: EditClientModalProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Tab 1: Subscription & Access
  const [planId, setPlanId] = useState(organization.plan_id || "");
  const [isActive, setIsActive] = useState(organization.is_active !== false);
  const [newPassword, setNewPassword] = useState("");

  // Tab 2: AI
  const [systemPrompt, setSystemPrompt] = useState(organization.system_prompt || "");
  const [openaiKey, setOpenaiKey] = useState(organization.openai_api_key || "");

  // Tab 3: Integration
  const [chatwootAccountId, setChatwootAccountId] = useState(
    organization.chatwoot_account_id?.toString() || ""
  );
  const [inboxId, setInboxId] = useState(organization.inbox_id?.toString() || "");
  const [chatwootUrl, setChatwootUrl] = useState(organization.chatwoot_url || "");
  const [chatwootToken, setChatwootToken] = useState(organization.chatwoot_token || "");

  // Tab 5: Smart Handoff
  const existingConfig = organization.ai_handoff_config || {};
  const [handoffEnabled, setHandoffEnabled] = useState(existingConfig.enabled === true);
  const [handoffKeywords, setHandoffKeywords] = useState(
    (existingConfig.keywords || []).join(", ")
  );
  const [handoffFarewell, setHandoffFarewell] = useState(existingConfig.farewell_message || "");
  const [handoffTeamId, setHandoffTeamId] = useState(
    existingConfig.team_id?.toString() || ""
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const saveSubscription = async () => {
    setSaving(true);
    try {
      // Save plan
      const updates: Record<string, any> = {};
      if (planId && planId !== organization.plan_id) {
        updates.plan_id = planId;
      }

      if (Object.keys(updates).length > 0) {
        const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error("Erro ao salvar");
      }

      // Toggle active/blocked
      if (isActive !== (organization.is_active !== false)) {
        const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}/status`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ is_active: isActive }),
        });
        if (!res.ok) throw new Error("Erro ao alterar status");
      }

      showMsg("Assinatura salva com sucesso!");
    } catch (err: any) {
      showMsg(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showMsg("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}/reset-password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) throw new Error("Erro ao redefinir senha");
      setNewPassword("");
      showMsg("Senha redefinida com sucesso!");
    } catch (err: any) {
      showMsg(err.message || "Erro ao redefinir");
    } finally {
      setSaving(false);
    }
  };

  const saveAI = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (systemPrompt !== (organization.system_prompt || "")) updates.system_prompt = systemPrompt;
      if (openaiKey !== (organization.openai_api_key || "")) updates.openai_api_key = openaiKey;

      if (Object.keys(updates).length > 0) {
        const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error("Erro ao salvar");
      }
      showMsg("Configurações de IA salvas!");
    } catch (err: any) {
      showMsg(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveIntegration = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (chatwootAccountId) updates.chatwoot_account_id = parseInt(chatwootAccountId);
      if (inboxId) updates.inbox_id = parseInt(inboxId);
      if (chatwootUrl) updates.chatwoot_url = chatwootUrl;
      if (chatwootToken) updates.chatwoot_token = chatwootToken;

      if (Object.keys(updates).length > 0) {
        const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error("Erro ao salvar");
      }
      showMsg("Integrações salvas!");
    } catch (err: any) {
      showMsg(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveHandoff = async () => {
    setSaving(true);
    try {
      const keywords = handoffKeywords
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);

      const config: Record<string, any> = {
        enabled: handoffEnabled,
        keywords,
        farewell_message: handoffFarewell || null,
        team_id: handoffTeamId ? parseInt(handoffTeamId) : null,
      };

      const res = await fetch(`${apiUrl}/api/admin/organizations/${organization.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ai_handoff_config: config }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      showMsg("Configuração de transbordo salva!");
    } catch (err: any) {
      showMsg(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar: {organization.name}</DialogTitle>
        </DialogHeader>

        {message && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
        )}

        <Tabs defaultValue="subscription">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="subscription" className="text-xs">
              Assinatura & Acesso
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">
              Inteligência (IA)
            </TabsTrigger>
            <TabsTrigger value="integration" className="text-xs">
              Integração Técnica
            </TabsTrigger>
            <TabsTrigger value="instances" className="text-xs">
              Instâncias WhatsApp
            </TabsTrigger>
            <TabsTrigger value="handoff" className="text-xs">
              Transbordo
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Subscription & Access */}
          <TabsContent value="subscription" className="space-y-4">
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Status da Organização</Label>
                <p className="text-xs text-muted-foreground">
                  {isActive ? "Organização ativa" : "Organização bloqueada"}
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="flex justify-end">
              <Button onClick={saveSubscription} disabled={saving} size="sm">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>

            <hr className="border-border" />

            <div className="space-y-2">
              <Label>Redefinir Senha do Dono</Label>
              <p className="text-xs text-muted-foreground">
                {organization.owner?.email || "Sem email"}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Nova senha (min. 6 caracteres)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button onClick={resetPassword} disabled={saving} size="sm" variant="outline">
                  Redefinir
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab 2: AI */}
          <TabsContent value="ai" className="space-y-4">
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                rows={8}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Prompt de sistema para a IA..."
              />
            </div>

            <div className="space-y-2">
              <Label>OpenAI API Key</Label>
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={saveAI} disabled={saving} size="sm">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </TabsContent>

          {/* Tab 3: Integration */}
          <TabsContent value="integration" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chatwoot Account ID</Label>
                <Input
                  value={chatwootAccountId}
                  onChange={(e) => setChatwootAccountId(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Inbox ID</Label>
                <Input
                  value={inboxId}
                  onChange={(e) => setInboxId(e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Chatwoot URL</Label>
              <Input
                value={chatwootUrl}
                onChange={(e) => setChatwootUrl(e.target.value)}
                placeholder="https://chatwoot.example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Chatwoot Token</Label>
              <Input
                type="password"
                value={chatwootToken}
                onChange={(e) => setChatwootToken(e.target.value)}
                placeholder="Token de acesso"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={saveIntegration} disabled={saving} size="sm">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </TabsContent>

          {/* Tab 4: WhatsApp Instances */}
          <TabsContent value="instances" className="space-y-4">
            <AdminInstances
              orgId={organization.id}
              accessToken={accessToken}
            />
          </TabsContent>

          {/* Tab 5: Smart Handoff */}
          <TabsContent value="handoff" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Transbordo por Palavra-chave</Label>
                <p className="text-xs text-muted-foreground">
                  Transfere automaticamente para humano quando detectar palavras-chave
                </p>
              </div>
              <Switch checked={handoffEnabled} onCheckedChange={setHandoffEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Palavras-chave</Label>
              <Textarea
                rows={3}
                value={handoffKeywords}
                onChange={(e) => setHandoffKeywords(e.target.value)}
                placeholder="falar com atendente, humano, pessoa real, atendente"
                disabled={!handoffEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Separadas por vírgula. Se o cliente enviar qualquer uma dessas palavras, será transferido imediatamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Mensagem de Despedida</Label>
              <Textarea
                rows={2}
                value={handoffFarewell}
                onChange={(e) => setHandoffFarewell(e.target.value)}
                placeholder="Estou transferindo você para um de nossos atendentes. Aguarde um momento!"
                disabled={!handoffEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Enviada ao cliente antes da transferência. Também usada quando a IA decide transferir.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Team ID (opcional)</Label>
              <Input
                value={handoffTeamId}
                onChange={(e) => setHandoffTeamId(e.target.value)}
                placeholder="ID do time no Chatwoot"
                disabled={!handoffEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Se preenchido, a conversa será atribuída a esse time no Chatwoot.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveHandoff} disabled={saving} size="sm">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
