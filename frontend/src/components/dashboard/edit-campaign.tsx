"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Campaign {
  id: string;
  name: string;
  template_message: string;
  send_interval_seconds: number;
  total_leads: number;
  status: string;
}

interface EditCampaignProps {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCampaign({ campaign, open, onOpenChange }: EditCampaignProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [leadsCount, setLeadsCount] = useState(campaign.total_leads);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(campaign.name);
  const [template, setTemplate] = useState(campaign.template_message);
  const [interval, setInterval] = useState(String(campaign.send_interval_seconds));

  const handleSave = async () => {
    if (!name.trim() || !template.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns/${campaign.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            template_message: template.trim(),
            send_interval_seconds: parseInt(interval) || 30,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to update campaign");

      toast({ title: "Campanha atualizada!" });
      onOpenChange(false);
    } catch (err) {
      console.error("Update campaign error:", err);
      toast({ title: "Erro ao atualizar campanha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns/${campaign.id}/upload-csv`,
        { method: "POST", body: formData }
      );

      if (!res.ok) throw new Error("Failed to upload CSV");

      const data = await res.json();
      setLeadsCount(data.leads_imported || 0);

      toast({
        title: "Leads importados!",
        description: `${data.leads_imported} leads adicionados a campanha.`,
      });
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: "Erro ao importar CSV", variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Campanha</DialogTitle>
          <DialogDescription>
            Altere os dados da campanha e faca upload de novos leads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-name">Nome da Campanha</Label>
            <Input
              id="edit-campaign-name"
              placeholder="Ex: Black Friday 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-campaign-template">Mensagem Template</Label>
            <Textarea
              id="edit-campaign-template"
              placeholder="Ola {{nome}}, tudo bem?..."
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{nome}}"} para personalizar com o nome do lead.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-campaign-interval">
              Intervalo entre envios (segundos)
            </Label>
            <Input
              id="edit-campaign-interval"
              type="number"
              min="10"
              max="300"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>

          {/* CSV Upload Section */}
          <div className="space-y-2">
            <Label>Lista de Leads (CSV)</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:border-shark-blue/50 hover:bg-shark-blue/5"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">
                {uploading ? "Enviando..." : "Clique para enviar novo CSV"}
              </p>
              <p className="text-xs text-muted-foreground">
                O CSV anterior sera substituido. Colunas: nome, telefone
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{leadsCount} leads na campanha</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-shark-blue hover:bg-shark-blue/90"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Salvar Alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
