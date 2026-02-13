-- Sprint 8: Kommo Inbound Integration
-- Adds configurable welcome message for proactive WhatsApp outreach when leads arrive from Kommo

-- Mensagem de boas-vindas configurável por org (usada quando lead chega da Kommo)
-- Suporta variável {{nome}} que é substituída pelo nome do lead
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS kommo_welcome_message text
  DEFAULT 'Olá {{nome}}! Vi que você demonstrou interesse. Como posso te ajudar?';
