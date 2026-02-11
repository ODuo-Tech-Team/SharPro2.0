-- ============================================================================
-- SPRINT 1: AI Status & Idempotent Sales
-- Adds ai_status to conversations, conversation_id + confirmed_by to sales_metrics
-- ============================================================================

-- 1. Add ai_status column to conversations
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'active'
    CHECK (ai_status IN ('active', 'paused'));

-- 2. Index for fast lookup by conversation_id + ai_status
CREATE INDEX IF NOT EXISTS idx_conversations_ai_status
    ON public.conversations (conversation_id, ai_status);

-- 3. Add conversation_id to sales_metrics for idempotency
ALTER TABLE public.sales_metrics
    ADD COLUMN IF NOT EXISTS conversation_id bigint;

-- 4. Add confirmed_by to sales_metrics
ALTER TABLE public.sales_metrics
    ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT 'label';

-- 5. Unique index to prevent duplicate sales per conversation per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_metrics_conversation_unique
    ON public.sales_metrics (organization_id, conversation_id)
    WHERE conversation_id IS NOT NULL;

-- 6. Enable realtime for conversations table
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
