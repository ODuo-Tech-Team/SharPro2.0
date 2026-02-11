import { AdminClientsContent } from "@/components/admin/admin-clients-content";

export default function AdminClientsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Visualize e gerencie todas as organizacoes da plataforma.
        </p>
      </div>

      <AdminClientsContent />
    </div>
  );
}
