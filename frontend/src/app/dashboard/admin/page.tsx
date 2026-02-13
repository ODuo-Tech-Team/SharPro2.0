import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClientsContent } from "@/components/admin/admin-clients-content";

export default async function DashboardAdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_superadmin) {
    redirect("/dashboard");
  }

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
