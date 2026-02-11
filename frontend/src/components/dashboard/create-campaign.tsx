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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface CreateCampaignProps {
  accountId: number;
}

export function CreateCampaign({ accountId }: CreateCampaignProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"form" | "upload">("form");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [interval, setInterval] = useState("30");

  const handleCreate = async () => {
    if (!name.trim() || !template.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            name: name.trim(),
            template_message: template.trim(),
            send_interval_seconds: parseInt(interval) || 30,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to create campaign");

      const data = await res.json();
      setCampaignId(data.campaign?.id);
      setStep("upload");

      toast({ title: "Campanha criada!", description: "Agora faca upload da lista de leads." });
    } catch (err) {
      console.error("Create campaign error:", err);
      toast({ title: "Erro ao criar campanha", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !campaignId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns/${campaignId}/upload-csv`,
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
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset
    setTimeout(() => {
      setStep("form");
      setCampaignId(null);
      setLeadsCount(0);
      setName("");
      setTemplate("");
      setInterval("30");
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button className="bg-shark-blue hover:bg-shark-blue/90">
          <Plus className="mr-2 h-4 w-4" />
          Nova Campanha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Criar Campanha</DialogTitle>
              <DialogDescription>
                Configure sua campanha de prospeccao ativa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Nome da Campanha</Label>
                <Input
                  id="campaign-name"
                  placeholder="Ex: Black Friday 2025"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-template">Mensagem Template</Label>
                <Textarea
                  id="campaign-template"
                  placeholder="Ola {{nome}}, tudo bem? Tenho uma oferta especial para voce..."
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{nome}}"} para personalizar com o nome do lead.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-interval">
                  Intervalo entre envios (segundos)
                </Label>
                <Input
                  id="campaign-interval"
                  type="number"
                  min="10"
                  max="300"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                className="bg-shark-blue hover:bg-shark-blue/90"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Criar Campanha
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Importar Leads</DialogTitle>
              <DialogDescription>
                Faca upload de um arquivo CSV com colunas: nome, telefone
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-shark-blue/50 hover:bg-shark-blue/5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {uploading ? "Enviando..." : "Clique para selecionar CSV"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Colunas aceitas: nome/name, telefone/phone/whatsapp
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>

              {leadsCount > 0 && (
                <p className="text-center text-sm text-emerald-600 font-medium">
                  {leadsCount} leads importados com sucesso!
                </p>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                {leadsCount > 0 ? "Concluir" : "Fechar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
