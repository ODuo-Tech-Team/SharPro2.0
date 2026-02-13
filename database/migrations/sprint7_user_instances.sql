-- Sprint 7: User-Instance junction table for multi-attendant isolation
-- Each user (attendant) can be assigned to specific WhatsApp instances.
-- Users with no assignments see ALL conversations (backward compatible).

CREATE TABLE IF NOT EXISTS public.user_instances (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, instance_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_instances_user ON public.user_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_instances_instance ON public.user_instances(instance_id);

-- RLS
ALTER TABLE public.user_instances ENABLE ROW LEVEL SECURITY;

-- Policy: users can see their own assignments
CREATE POLICY "Users can view own instance assignments"
    ON public.user_instances FOR SELECT
    USING (user_id = auth.uid());

-- Policy: admins can manage all assignments within their org
CREATE POLICY "Admins can manage instance assignments"
    ON public.user_instances FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.organization_id = (
                  SELECT organization_id FROM public.profiles WHERE id = user_instances.user_id
              )
        )
    );

-- Add to realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_instances;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_instances REPLICA IDENTITY FULL;
