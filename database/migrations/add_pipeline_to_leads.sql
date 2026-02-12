-- Migration: Add sales pipeline columns to leads table
-- Run this in Supabase SQL Editor

-- Pipeline status for the sales funnel
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'ia_atendendo';

-- AI-generated summary (saved on handoff)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_summary text;

-- Estimated deal value in BRL
ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_value numeric DEFAULT 0;

-- Last interaction timestamp
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz DEFAULT now();

-- Link to Chatwoot conversation
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_id bigint;

-- Indexes for pipeline queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(organization_id, pipeline_status);
CREATE INDEX IF NOT EXISTS idx_leads_conv ON leads(conversation_id);
