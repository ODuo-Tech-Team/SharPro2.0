import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsTable } from "@/components/admin/clients-table";

async function fetchAdminData(accessToken: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const [orgsRes, plansRes] = await Promise.all([
    fetch(`${apiUrl}/api/admin/organizations`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/api/admin/plans`, { headers, cache: "no-store" }),
  ]);

  const orgsData = orgsRes.ok ? await orgsRes.json() : { organizations: [] };
  const plansData = plansRes.ok ? await plansRes.json() : { plans: [] };

  return {
    organizations: orgsData.organizations || [],
    plans: plansData.plans || [],
  };
}

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { organizations, plans } = await fetchAdminData(session.access_token);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Visualize e gerencie todas as organizacoes da plataforma.
        </p>
      </div>

      <ClientsTable
        organizations={organizations}
        plans={plans}
        accessToken={session.access_token}
      />
    </div>
  );
}
