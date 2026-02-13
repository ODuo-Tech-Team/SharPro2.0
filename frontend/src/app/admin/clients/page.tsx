import { AdminClientsContent } from "@/components/admin/admin-clients-content";

export default function AdminClientsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Visualize e gerencie todas as empresas cadastradas na plataforma. Clique na seta para ver os detalhes completos.
        </p>
      </div>

      <AdminClientsContent />
    </div>
  );
}
