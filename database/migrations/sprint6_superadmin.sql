-- Sprint 6: Super Admin (God Mode)
-- Adds superadmin flag to profiles and active toggle to organizations

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Partial indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_superadmin ON profiles (is_superadmin) WHERE is_superadmin = true;
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations (is_active) WHERE is_active = false;

-- To set a user as superadmin, run manually:
-- UPDATE profiles SET is_superadmin = true WHERE id = 'YOUR-USER-UUID';
