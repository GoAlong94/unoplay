-- Add muted column for lobby players to support muting
ALTER TABLE public.lobby_players
ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;

-- Allow host to update lobby_players (e.g., mute/unmute)
DO $$ BEGIN
  CREATE POLICY "Host can update lobby players"
  ON public.lobby_players
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lobbies l
      WHERE l.id = lobby_players.lobby_id AND l.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow host to remove (kick) players from their lobby
DO $$ BEGIN
  CREATE POLICY "Host can remove players"
  ON public.lobby_players
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.lobbies l
      WHERE l.id = lobby_players.lobby_id AND l.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Replace chat insert policy to block muted users
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.chat_messages;
END $$;

CREATE POLICY "Unmuted users can send messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.lobby_players lp
    WHERE lp.lobby_id = chat_messages.lobby_id
      AND lp.user_id = auth.uid()
      AND lp.muted = true
  )
);

-- Basic analytics table
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view analytics"
  ON public.analytics_events
  FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own analytics"
  ON public.analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Optional: index on event_type for quick counts
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events (event_type);
