import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { DashboardContent } from "./dashboard-content";
import { subDays, format, startOfDay } from "date-fns";

interface LeadChartData {
  date: string;
  leads: number;
}

interface RecentSale {
  id: string;
  amount: number;
  source: string;
  created_at: string;
}

interface RecentConversation {
  conversation_id: number;
  ai_status: string;
  status: string;
  updated_at: string;
}

async function getDashboardData() {
  const supabase = await createClient();

  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  // Get user profile to determine organization_id
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, is_superadmin")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  const orgId = profile.organization_id;

  // Run all queries in parallel
  const [
    leadsResult,
    salesResult,
    recentSalesResult,
    activeConversations,
    recentConversationsResult,
  ] = await Promise.all([
    // Total leads
    supabase
      .from("leads")
      .select("id, created_at", { count: "exact" })
      .eq("organization_id", orgId),
    // Sales metrics
    supabase
      .from("sales_metrics")
      .select("amount, source, created_at")
      .eq("organization_id", orgId),
    // Recent sales (latest 5)
    supabase
      .from("sales_metrics")
      .select("id, amount, source, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    // Active conversations (leads with status 'new' or 'qualified')
    supabase
      .from("leads")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .in("status", ["new", "qualified"]),
    // Recent conversations (latest 5 for the table)
    supabase
      .from("conversations")
      .select("conversation_id, ai_status, status, updated_at")
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  // Calculate total leads
  const totalLeads = leadsResult.count ?? 0;

  // Calculate leads from last 7 days for trend
  const sevenDaysAgo = subDays(new Date(), 7);
  const fourteenDaysAgo = subDays(new Date(), 14);
  const leadsLast7 = (leadsResult.data ?? []).filter(
    (l) => new Date(l.created_at) >= sevenDaysAgo
  ).length;
  const leadsPrev7 = (leadsResult.data ?? []).filter(
    (l) =>
      new Date(l.created_at) >= fourteenDaysAgo &&
      new Date(l.created_at) < sevenDaysAgo
  ).length;
  const leadsTrend =
    leadsPrev7 > 0
      ? Math.round(((leadsLast7 - leadsPrev7) / leadsPrev7) * 100)
      : leadsLast7 > 0
        ? 100
        : 0;

  // Calculate sales volume
  const allSales = salesResult.data ?? [];
  const totalSalesVolume = allSales.reduce((sum, s) => sum + (s.amount || 0), 0);

  // Sales count (total number of sales_metrics records)
  const salesCount = allSales.length;

  // AI Efficiency
  const aiSales = allSales.filter((s) => s.source === "ai").length;
  const aiEfficiency =
    allSales.length > 0 ? Math.round((aiSales / allSales.length) * 100) : 0;

  // Active conversations count (from conversations table with ai_status)
  const [conversationsActive, conversationsPaused] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("ai_status", "active"),
    supabase
      .from("conversations")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("ai_status", "paused"),
  ]);

  const activeCount = activeConversations.count ?? 0;
  const conversationsActiveCount = conversationsActive.count ?? 0;
  const conversationsPausedCount = conversationsPaused.count ?? 0;

  // Build chart data (leads per day, last 30 days)
  const chartData: LeadChartData[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = startOfDay(subDays(new Date(), i));
    const dayStr = format(day, "dd/MM");
    const nextDay = startOfDay(subDays(new Date(), i - 1));
    const count = (leadsResult.data ?? []).filter((l) => {
      const d = new Date(l.created_at);
      return d >= day && d < nextDay;
    }).length;
    chartData.push({ date: dayStr, leads: count });
  }

  // Recent sales
  const recentSales: RecentSale[] = (recentSalesResult.data ?? []).map(
    (s) => ({
      id: s.id,
      amount: s.amount,
      source: s.source,
      created_at: s.created_at,
    })
  );

  // Recent conversations
  const recentConversations: RecentConversation[] = (
    recentConversationsResult.data ?? []
  ).map((c) => ({
    conversation_id: c.conversation_id,
    ai_status: c.ai_status,
    status: c.status,
    updated_at: c.updated_at,
  }));

  return {
    orgId,
    isSuperAdmin: profile.is_superadmin === true,
    totalLeads,
    leadsTrend,
    totalSalesVolume,
    salesCount,
    aiEfficiency,
    activeCount,
    conversationsActiveCount,
    conversationsPausedCount,
    chartData,
    recentSales,
    recentConversations,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Não foi possível carregar os dados.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent
      orgId={data.orgId}
      isSuperAdmin={data.isSuperAdmin}
      totalLeads={data.totalLeads}
      leadsTrend={data.leadsTrend}
      totalSalesVolume={data.totalSalesVolume}
      salesCount={data.salesCount}
      aiEfficiency={data.aiEfficiency}
      activeCount={data.activeCount}
      conversationsActiveCount={data.conversationsActiveCount}
      conversationsPausedCount={data.conversationsPausedCount}
      chartData={data.chartData}
      recentSales={data.recentSales}
      recentConversations={data.recentConversations}
    />
  );
}
