"use client";

export default function AdminMeetingsPage() {
  return (
    <div className="space-y-6 h-[calc(100vh-6rem)]">
      <div>
        <h1 className="text-2xl font-bold">Agendar Reuniao</h1>
        <p className="text-sm text-muted-foreground">
          Utilize o prompt da Oduo para agendar e gerenciar reunioes com clientes.
        </p>
      </div>

      <div className="flex-1 rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 12rem)" }}>
        <iframe
          src="https://oduo.com.br"
          title="Oduo - Agendar Reuniao"
          className="w-full h-full border-0"
          allow="microphone; camera; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
        />
      </div>
    </div>
  );
}
