-- ============================================================================
-- SHARKPRO V2 - PHASE 1: Database Schema & Security
-- Multi-tenant SaaS AI Automation Platform
-- Target: Supabase (Postgres) - Execute in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 organizations
-- Central tenant table. Each organization has its own Chatwoot + OpenAI config.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text        NOT NULL,

    -- Chatwoot integration
    chatwoot_account_id int,
    chatwoot_url        text,
    chatwoot_token      text,

    -- OpenAI integration
    openai_api_key      text,

    -- AI personality per tenant
    system_prompt       text,

    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.organizations IS 'Tenant table - one row per customer organization.';
COMMENT ON COLUMN public.organizations.chatwoot_account_id IS 'Maps to the Chatwoot account_id received in webhook payloads.';
COMMENT ON COLUMN public.organizations.system_prompt IS 'Custom AI system prompt that defines the bot personality for this tenant.';

-- ----------------------------------------------------------------------------
-- 1.2 profiles
-- Links Supabase Auth users to their organization and role.
-- One row per user, created automatically via trigger on auth.users.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    organization_id     uuid        NOT NULL REFERENCES public.organizations (id),
    role                text        NOT NULL DEFAULT 'member'
                                    CHECK (role IN ('admin', 'member')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles IS 'User profile bridging auth.users to an organization with a role.';
COMMENT ON COLUMN public.profiles.role IS 'admin = full access; member = read-only dashboards.';

-- ----------------------------------------------------------------------------
-- 1.3 leads
-- Leads captured by the AI bot or registered manually.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations (id),
    contact_id          bigint,                   -- Chatwoot contact ID
    name                text,
    phone               text,
    status              text        NOT NULL DEFAULT 'new',
    conversion_value    numeric     NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.leads IS 'Leads registered via AI tool_call or manual entry.';
COMMENT ON COLUMN public.leads.contact_id IS 'Chatwoot contact ID for cross-referencing.';

-- ----------------------------------------------------------------------------
-- 1.4 sales_metrics
-- Tracks completed sales and their source (AI vs human).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_metrics (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations (id),
    amount              numeric     NOT NULL,
    source              text        NOT NULL
                                    CHECK (source IN ('ai', 'human')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.sales_metrics IS 'Revenue events tagged by source for AI efficiency tracking.';

-- ----------------------------------------------------------------------------
-- 1.5 conversations
-- Tracks active conversation state for the bot worker.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations (id),
    conversation_id     bigint      UNIQUE NOT NULL,   -- Chatwoot conversation ID
    contact_id          bigint,                        -- Chatwoot contact ID
    status              text        NOT NULL DEFAULT 'bot',
    assigned_to         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.conversations IS 'Mirrors Chatwoot conversation state so the worker knows if the bot is active.';
COMMENT ON COLUMN public.conversations.status IS 'bot = AI is handling; human = transferred to agent.';
COMMENT ON COLUMN public.conversations.conversation_id IS 'Chatwoot conversation ID (unique across the platform).';


-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_organization_id
    ON public.leads (organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_contact_id
    ON public.leads (contact_id);

CREATE INDEX IF NOT EXISTS idx_sales_metrics_organization_id
    ON public.sales_metrics (organization_id);

CREATE INDEX IF NOT EXISTS idx_sales_metrics_created_at
    ON public.sales_metrics (created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
    ON public.profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_conversations_organization_id
    ON public.conversations (organization_id);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
    ON public.conversations (contact_id);


-- ============================================================================
-- 3. HELPER FUNCTION: get_user_org_id()
-- Returns the organization_id for the currently authenticated user.
-- Used in all RLS policies to enforce tenant isolation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_org_id() IS 'Returns the organization_id for the current auth.uid(). Core of multi-tenant RLS.';


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- Every table is locked down: users only see data from their own organization.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 organizations
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.organizations
    FOR SELECT
    USING (id = public.get_user_org_id());

CREATE POLICY insert_own ON public.organizations
    FOR INSERT
    WITH CHECK (id = public.get_user_org_id());

CREATE POLICY update_own ON public.organizations
    FOR UPDATE
    USING (id = public.get_user_org_id())
    WITH CHECK (id = public.get_user_org_id());

-- ----------------------------------------------------------------------------
-- 4.2 profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.profiles
    FOR SELECT
    USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.profiles
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.profiles
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

-- ----------------------------------------------------------------------------
-- 4.3 leads
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.leads
    FOR SELECT
    USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.leads
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.leads
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

-- ----------------------------------------------------------------------------
-- 4.4 sales_metrics
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.sales_metrics
    FOR SELECT
    USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.sales_metrics
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.sales_metrics
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

-- ----------------------------------------------------------------------------
-- 4.5 conversations
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.conversations
    FOR SELECT
    USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.conversations
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.conversations
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());


-- ============================================================================
-- 5. AUTO-UPDATE updated_at TRIGGER (for conversations)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- 6. AUTO-CREATE PROFILE ON SIGNUP
-- Listens to inserts on auth.users and creates a corresponding profiles row.
--
-- Convention: the frontend passes organization_id inside raw_user_meta_data
-- during supabase.auth.signUp({ options: { data: { organization_id: '...' } } })
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, organization_id, role)
    VALUES (
        NEW.id,
        (NEW.raw_user_meta_data ->> 'organization_id')::uuid,
        COALESCE(NEW.raw_user_meta_data ->> 'role', 'member')
    );
    RETURN NEW;
END;
$$;

-- The trigger fires AFTER a new row is inserted into auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 7. GRANT PERMISSIONS
-- Supabase uses the 'anon' and 'authenticated' roles for API access.
-- The service_role bypasses RLS entirely (used by the backend worker).
-- ============================================================================

-- Allow authenticated users to use the helper function
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;

-- Table-level grants (RLS still controls row access)
GRANT SELECT, INSERT, UPDATE    ON public.organizations  TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.leads           TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.sales_metrics   TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.conversations   TO authenticated;

-- Service role (backend worker) needs full access - Supabase grants this by
-- default to service_role, but we are explicit for clarity.
GRANT ALL ON public.organizations  TO service_role;
GRANT ALL ON public.profiles        TO service_role;
GRANT ALL ON public.leads           TO service_role;
GRANT ALL ON public.sales_metrics   TO service_role;
GRANT ALL ON public.conversations   TO service_role;


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
