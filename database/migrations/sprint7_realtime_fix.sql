-- Sprint 7: Enable Supabase Realtime for leads, sales_metrics, conversations
-- This fixes the dashboard not updating in real-time.
-- CRITICAL: Without REPLICA IDENTITY FULL, filtered subscriptions
-- (e.g. organization_id=eq.X) silently fail because only the PK
-- is in the WAL record.

-- Add tables to the realtime publication (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_metrics;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CRITICAL: Enable REPLICA IDENTITY FULL so filters work
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.sales_metrics REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
