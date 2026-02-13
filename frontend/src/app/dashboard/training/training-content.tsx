"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Brain,
} from "lucide-react";

interface KnowledgeFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: string;
  content: string | null;
  created_at: string;
}

interface TrainingContentProps {
  orgId: string;
  accountId: number;
  initialFiles: KnowledgeFile[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrainingContent({
  orgId,
  accountId,
  initialFiles,
}: TrainingContentProps) {
  const [files, setFiles] = useState<KnowledgeFile[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`knowledge-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knowledge_files",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload: {
          eventType: string;
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          if (payload.eventType === "INSERT") {
            setFiles((prev) => [
              payload.new as unknown as KnowledgeFile,
              ...prev,
            ]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as KnowledgeFile;
            setFiles((prev) =>
              prev.map((f) => (f.id === updated.id ? updated : f))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as unknown as KnowledgeFile;
            setFiles((prev) => prev.filter((f) => f.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Apenas arquivos PDF são aceitos.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert("Arquivo muito grande. Máximo 20MB.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("account_id", String(accountId));

      const res = await fetch(
        `${"/backend-api"}/api/knowledge/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao enviar arquivo");
      }

      const data = await res.json();
      if (data.file) {
        setFiles((prev) => {
          const exists = prev.some((f) => f.id === data.file.id);
          if (exists) {
            return prev.map((f) => (f.id === data.file.id ? data.file : f));
          }
          return [data.file, ...prev];
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert(
        err instanceof Error ? err.message : "Erro ao enviar arquivo"
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeletingId(fileId);
    try {
      const res = await fetch(
        `${"/backend-api"}/api/knowledge/files/${fileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Erro ao excluir arquivo");
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Delete error:", err);
      alert("Erro ao excluir arquivo");
    } finally {
      setDeletingId(null);
    }
  };

  const readyFiles = files.filter((f) => f.status === "ready").length;
  const totalChars = files
    .filter((f) => f.status === "ready")
    .reduce((sum, f) => sum + (f.content?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Base de Conhecimento
          </h1>
          <p className="text-slate-400">
            Envie PDFs com informações sobre seus produtos e serviços. O texto
            será extraído e adicionado ao conhecimento da IA.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Enviando..." : "Enviar PDF"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">Arquivos</p>
          <p className="mt-1 text-2xl font-bold text-white">{files.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">Prontos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {readyFiles}
          </p>
        </div>
      </div>

      {/* Files List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-semibold text-white">
          Arquivos na Base
        </h2>

        {files.length === 0 ? (
          <div className="flex h-[120px] flex-col items-center justify-center gap-2">
            <Brain className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-500">
              Nenhum arquivo enviado. Envie um PDF para começar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((file) => {
              const isReady = file.status === "ready";
              const isError = file.status === "error";
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <FileText className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {file.file_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(file.file_size)}
                      {file.content &&
                        ` · ${file.content.length.toLocaleString()} caracteres`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      isReady
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : isError
                          ? "text-red-400 bg-red-500/10 border-red-500/20"
                          : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    }`}
                  >
                    {isReady ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : isError ? (
                      <AlertCircle className="h-3 w-3" />
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {isReady ? "Pronto" : isError ? "Erro" : "Processando"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(file.id)}
                    disabled={deletingId === file.id}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Excluir"
                  >
                    {deletingId === file.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
