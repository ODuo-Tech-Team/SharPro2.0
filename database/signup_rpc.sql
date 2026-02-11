-- Funcao para criar organizacao durante signup (bypassa RLS)
-- Necessario porque o usuario ainda nao esta autenticado no momento do cadastro
-- Atualizado Sprint 4: aceita plan_name para lookup do plan_id

CREATE OR REPLACE FUNCTION public.create_organization_for_signup(
  org_id uuid,
  org_name text,
  plan_name text DEFAULT 'Starter'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Lookup plan_id by name, fallback to Starter
  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE name = plan_name
  LIMIT 1;

  -- If plan not found, use Starter
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE name = 'Starter'
    LIMIT 1;
  END IF;

  INSERT INTO public.organizations (id, name, plan_id)
  VALUES (org_id, org_name, v_plan_id)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Permitir que qualquer usuario (incluindo anon) chame essa funcao
GRANT EXECUTE ON FUNCTION public.create_organization_for_signup(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_signup(uuid, text, text) TO authenticated;

-- Tambem precisamos garantir que o Supabase Auth confirme usuarios automaticamente
-- Va em: Supabase Dashboard > Authentication > Providers > Email
-- Desmarque "Confirm email" para desativar confirmacao por email (dev/teste)
