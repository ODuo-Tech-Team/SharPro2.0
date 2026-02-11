-- ============================================================================
-- SPRINT 4: Plans & Feedback
-- SaaS plan management with limits + user feedback system
-- ============================================================================

-- 1. Plans table
CREATE TABLE IF NOT EXISTS public.plans (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text        NOT NULL UNIQUE,
    max_users       int         NOT NULL DEFAULT 1,
    max_connections  int        NOT NULL DEFAULT 1,
    max_campaigns   int         NOT NULL DEFAULT 0,
    max_leads       int         NOT NULL DEFAULT 500,
    price_monthly   numeric     NOT NULL DEFAULT 0,
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS 'SaaS subscription plans with resource limits.';

-- 2. Seed plans
INSERT INTO public.plans (name, max_users, max_connections, max_campaigns, max_leads, price_monthly) VALUES
    ('Starter', 1, 1, 1, 500, 97.00),
    ('Pro', 3, 3, 5, 5000, 197.00),
    ('Enterprise', 10, 10, -1, -1, 497.00)
ON CONFLICT (name) DO NOTHING;

-- Note: -1 means unlimited

-- 3. Add plan_id to organizations
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans (id);

-- 4. Set default plan (Starter) for existing orgs without a plan
UPDATE public.organizations
SET plan_id = (SELECT id FROM public.plans WHERE name = 'Starter' LIMIT 1)
WHERE plan_id IS NULL;

-- 5. Feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.organizations (id),
    user_id         uuid        NOT NULL REFERENCES auth.users (id),
    type            text        NOT NULL DEFAULT 'other'
                                CHECK (type IN ('bug', 'feature', 'question', 'other')),
    title           text        NOT NULL,
    description     text        NOT NULL DEFAULT '',
    status          text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feedback IS 'User feedback, bug reports, and feature requests.';

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_organization_id
    ON public.feedback (organization_id);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id
    ON public.feedback (user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_status
    ON public.feedback (status);

CREATE INDEX IF NOT EXISTS idx_organizations_plan_id
    ON public.organizations (plan_id);

-- 7. RLS for plans (read-only for everyone)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_all ON public.plans
    FOR SELECT USING (true);

-- 8. RLS for feedback (by org)
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.feedback
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.feedback
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.feedback
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

-- 9. Grants
GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.plans TO anon;
GRANT ALL ON public.plans TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
