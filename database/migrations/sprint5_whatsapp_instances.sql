-- ============================================================================
-- SPRINT 5: WhatsApp Instance Manager
-- Stores Uazapi instances + Chatwoot inbox mappings per organization
-- ============================================================================

-- 1. whatsapp_instances table
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations (id),
    instance_name       text        NOT NULL UNIQUE,
    display_name        text        NOT NULL DEFAULT '',
    uazapi_token        text,
    chatwoot_inbox_id   int,
    chatwoot_inbox_token text,
    phone_number        text,
    status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'connecting', 'connected', 'disconnected', 'error')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.whatsapp_instances IS 'WhatsApp instances managed via Uazapi + Chatwoot inbox.';
COMMENT ON COLUMN public.whatsapp_instances.instance_name IS 'Unique slug for Uazapi (e.g. shark-pro-2).';
COMMENT ON COLUMN public.whatsapp_instances.status IS 'pending=created, connecting=QR shown, connected=active, disconnected=offline, error=failed.';

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org
    ON public.whatsapp_instances (organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status
    ON public.whatsapp_instances (status);

-- 3. Auto-update updated_at trigger
CREATE TRIGGER set_whatsapp_instances_updated_at
    BEFORE UPDATE ON public.whatsapp_instances
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON public.whatsapp_instances
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY insert_own ON public.whatsapp_instances
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY update_own ON public.whatsapp_instances
    FOR UPDATE
    USING (organization_id = public.get_user_org_id())
    WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY delete_own ON public.whatsapp_instances
    FOR DELETE USING (organization_id = public.get_user_org_id());

-- 5. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
