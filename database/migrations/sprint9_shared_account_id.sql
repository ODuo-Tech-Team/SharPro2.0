-- Sprint 9: Allow multiple organizations to share the same Chatwoot account_id
-- Each org is differentiated by their WhatsApp instances (inbox_ids)
--
-- Example: ODuo and Teste both use Chatwoot account_id=1
-- but ODuo has inbox 312 (SDR-IA) and Teste has inbox 365 (Teste-IA)

-- 1. Drop the UNIQUE constraint on chatwoot_account_id
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_chatwoot_account_id_key;

-- 2. Add a regular index for performance (non-unique)
CREATE INDEX IF NOT EXISTS idx_organizations_chatwoot_account_id
  ON public.organizations (chatwoot_account_id);
