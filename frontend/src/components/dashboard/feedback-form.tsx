"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface FeedbackFormProps {
  orgId: string;
  userId: string;
}

const feedbackTypes = [
  { value: "bug", label: "Bug / Erro" },
  { value: "feature", label: "Sugestão de Feature" },
  { value: "question", label: "Pergunta" },
  { value: "other", label: "Outro" },
];

export function FeedbackForm({ orgId, userId }: FeedbackFormProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Preencha o título", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("feedback").insert({
        organization_id: orgId,
        user_id: userId,
        type,
        title: title.trim(),
        description: description.trim(),
        status: "open",
      });

      if (error) throw error;

      toast({
        title: "Feedback enviado!",
        description: "Obrigado pela sua contribuição.",
        variant: "success",
      });

      setOpen(false);
      setTitle("");
      setDescription("");
      setType("feature");
      router.refresh();
    } catch (err) {
      console.error("Feedback error:", err);
      toast({ title: "Erro ao enviar feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-shark-blue hover:bg-shark-blue/90">
          <Plus className="mr-2 h-4 w-4" />
          Novo Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Enviar Feedback</DialogTitle>
          <DialogDescription>
            Compartilhe sugestões, reporte bugs ou faça perguntas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {feedbackTypes.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-title">Título</Label>
            <Input
              id="feedback-title"
              placeholder="Resumo do seu feedback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">Descrição</Label>
            <Textarea
              id="feedback-description"
              placeholder="Descreva com mais detalhes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-shark-blue hover:bg-shark-blue/90"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
