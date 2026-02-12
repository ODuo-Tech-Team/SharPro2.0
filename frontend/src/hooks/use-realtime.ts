"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  totalLeads: number;
  leadsTrend: number;
  totalSalesVolume: number;
  aiEfficiency: number;
  activeCount: number;
  chartData: { date: string; leads: number }[];
  recentSales: {
    id: string;
    amount: number;
    source: string;
    created_at: string;
  }[];
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  conversion_value: number | null;
  lead_score: number;
  interest_tags: string[];
  origin: string;
  created_at: string;
  pipeline_status: string;
  ai_summary: string | null;
  estimated_value: number;
  last_contact_at: string;
  conversation_id: number | null;
}

// ---------------------------------------------------------------------------
// Helper: debounced refetch (avoids hammering DB on burst of events)
// ---------------------------------------------------------------------------

function useDebouncedCallback(callback: () => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(callback, delay);
  }, [callback, delay]);
}

// ---------------------------------------------------------------------------
// useRealtimeDashboard
// ---------------------------------------------------------------------------

export function useRealtimeDashboard(
  orgId: string,
  initialData: DashboardData
) {
  const [data, setData] = useState<DashboardData>(initialData);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createClient();

    const [leadsResult, salesResult, recentSalesResult, activeResult] =
      await Promise.all([
        supabase
          .from("leads")
          .select("id, created_at", { count: "exact" })
          .eq("organization_id", orgId),
        supabase
          .from("sales_metrics")
          .select("amount, source, created_at")
          .eq("organization_id", orgId),
        supabase
          .from("sales_metrics")
          .select("id, amount, source, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("leads")
          .select("id", { count: "exact" })
          .eq("organization_id", orgId)
          .in("status", ["new", "qualified"]),
      ]);

    const totalLeads = leadsResult.count ?? 0;

    // Trend: last 7 vs previous 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
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

    // Sales
    const allSales = salesResult.data ?? [];
    const totalSalesVolume = allSales.reduce(
      (sum, s) => sum + (s.amount || 0),
      0
    );
    const aiSales = allSales.filter((s) => s.source === "ai").length;
    const aiEfficiency =
      allSales.length > 0
        ? Math.round((aiSales / allSales.length) * 100)
        : 0;

    const activeCount = activeResult.count ?? 0;

    // Chart data (last 30 days)
    const chartData: { date: string; leads: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 86400000);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day.getTime() + 86400000);
      const dayStr = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;
      const count = (leadsResult.data ?? []).filter((l) => {
        const d = new Date(l.created_at);
        return d >= day && d < nextDay;
      }).length;
      chartData.push({ date: dayStr, leads: count });
    }

    const recentSales = (recentSalesResult.data ?? []).map((s) => ({
      id: s.id,
      amount: s.amount,
      source: s.source,
      created_at: s.created_at,
    }));

    setData({
      totalLeads,
      leadsTrend,
      totalSalesVolume,
      aiEfficiency,
      activeCount,
      chartData,
      recentSales,
    });
  }, [orgId]);

  const debouncedRefetch = useDebouncedCallback(refetch, 500);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${orgId}`,
        },
        () => debouncedRefetch()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_metrics",
          filter: `organization_id=eq.${orgId}`,
        },
        () => debouncedRefetch()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, debouncedRefetch]);

  return data;
}

// ---------------------------------------------------------------------------
// useRealtimeLeads
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useRealtimeConversations
// ---------------------------------------------------------------------------

interface Conversation {
  id: string;
  conversation_id: number;
  contact_id: number | null;
  ai_status: string;
  status: string;
  updated_at: string;
}

export function useRealtimeConversations(
  orgId: string,
  initialConversations: Conversation[]
) {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversations-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const newConv = payload.new as Conversation;
          setConversations((prev) => [newConv, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const updated = payload.new as Conversation;
          setConversations((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return conversations;
}

// ---------------------------------------------------------------------------
// useRealtimeLeads
// ---------------------------------------------------------------------------

export function useRealtimeLeads(orgId: string, initialLeads: Lead[]) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`leads-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => [newLead, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const updated = payload.new as Lead;
          setLeads((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setLeads((prev) => prev.filter((l) => l.id !== deleted.id));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return leads;
}
