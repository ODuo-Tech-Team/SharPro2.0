"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientsTable } from "@/components/admin/clients-table";
import { Loader2 } from "lucide-react";

export function AdminClientsContent() {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }

      setAccessToken(session.access_token);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      };

      try {
        const [orgsRes, plansRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/organizations`, { headers }),
          fetch(`${apiUrl}/api/admin/plans`, { headers }),
        ]);

        const orgsData = orgsRes.ok
          ? await orgsRes.json()
          : { organizations: [] };
        const plansData = plansRes.ok ? await plansRes.json() : { plans: [] };

        setOrganizations(orgsData.organizations || []);
        setPlans(plansData.plans || []);
      } catch {
        setError("Erro ao carregar dados. Verifique a conexão com o servidor.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <ClientsTable
      organizations={organizations}
      plans={plans}
      accessToken={accessToken}
    />
  );
}
