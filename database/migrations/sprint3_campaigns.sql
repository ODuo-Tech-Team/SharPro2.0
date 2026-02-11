-- ============================================================================
-- SPRINT 3: Campaigns & Campaign Leads
-- Active prospecting with outbound messaging via Chatwoot
-- ============================================================================

-- 1. Campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.organizations (id),
    name            text        NOT NULL,
    status          text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    template_message text       NOT NULL DEFAULT '',
    send_interval_seconds int   NOT NULL DEFAULT 30,
    total_leads     int         NOT NULL DEFAULT 0,
    sent_count      int         NOT NULL DEFAULT 0,
    replied_count   int         NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz,
    completed_at    timestamptz
);

COMMENT ON TABLE public.campaigns IS 'Outbound campaign definitions for active prospecting.';

-- 2. Campaign leads table
CREATE TABLE IF NOT EXISTS public.campaign_leads (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     uuid        NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
    organization_id uuid        NOT NULL REFERENCES public.organizations (id),
    name            text        NOT NULL DEFAULT '',
    phone           text        NOT NULL,
    status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'sent', 'replied', 'failed', 'skipped')),
    sent_at         timestamptz,
    replied_at      timestamptz,
    conversation_id bigint,
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaign_leads IS 'Individual leads within a campaign, tracking send/reply status.';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id
    ON public.campaigns (organization_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_status
    ON public.campaigns (status);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id
    ON public.campaign_leads (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_status
    ON public.campaign_leads (status);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_phone
    ON public.campaign_leads (phone);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_organization_id
    ON public.campaign_leads (organization_id);

-- 4. RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.campaigns
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.campaigns
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.campaigns
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.campaign_leads
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.campaign_leads
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.campaign_leads
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

-- 5. Grants
GRANT SELECT, INSERT, UPDATE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_leads TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.campaign_leads TO service_role;

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_leads;
