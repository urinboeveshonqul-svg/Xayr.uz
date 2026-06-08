-- Campaign flags (user reports) -------------------------------------------
-- Stores user-submitted reports about suspicious/inappropriate campaigns.
-- Separate from campaign_reports (completion reports by creators).

CREATE TABLE IF NOT EXISTS campaign_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reporter_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reason      text        NOT NULL CHECK (reason IN ('fraud', 'misleading', 'spam', 'other')),
  details     text,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolved_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_flags ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit a flag for their own reporter_id.
CREATE POLICY "flags_insert" ON campaign_flags
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Only admins can read flags.
CREATE POLICY "flags_select_admin" ON campaign_flags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can update flags (mark resolved).
CREATE POLICY "flags_update_admin" ON campaign_flags
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for fast admin queries by status.
CREATE INDEX IF NOT EXISTS campaign_flags_status_idx ON campaign_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_flags_campaign_idx ON campaign_flags (campaign_id);
