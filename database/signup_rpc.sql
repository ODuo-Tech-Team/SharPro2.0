-- Funcao para criar organizacao durante signup (bypassa RLS)
-- Necessario porque o usuario ainda nao esta autenticado no momento do cadastro

CREATE OR REPLACE FUNCTION public.create_organization_for_signup(
  org_id uuid,
  org_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organizations (id, name)
  VALUES (org_id, org_name)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Permitir que qualquer usuario (incluindo anon) chame essa funcao
GRANT EXECUTE ON FUNCTION public.create_organization_for_signup(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_signup(uuid, text) TO authenticated;

-- Tambem precisamos garantir que o Supabase Auth confirme usuarios automaticamente
-- Vá em: Supabase Dashboard > Authentication > Providers > Email
-- Desmarque "Confirm email" para desativar confirmacao por email (dev/teste)
