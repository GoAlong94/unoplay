
-- Add game_rules jsonb column to lobbies for toggleable rules
ALTER TABLE public.lobbies ADD COLUMN IF NOT EXISTS game_rules jsonb DEFAULT '{
  "catch_uno_penalty": true,
  "stacking": false,
  "force_play": true,
  "seven_zero_rule": false,
  "jump_in": false,
  "end_with_power_card": true,
  "draw_penalty_skip": true
}'::jsonb;

-- Add pause columns to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS paused_at timestamptz DEFAULT NULL;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS pause_duration_minutes integer DEFAULT NULL;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS pause_ready_players jsonb DEFAULT '[]'::jsonb;

-- Create friends table
CREATE TABLE IF NOT EXISTS public.friends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON public.friends
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can send friend requests" ON public.friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own friendships" ON public.friends
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete own friendships" ON public.friends
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Create player_stats table
CREATE TABLE IF NOT EXISTS public.player_stats (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  games_played integer NOT NULL DEFAULT 0,
  games_won integer NOT NULL DEFAULT 0,
  cards_drawn integer NOT NULL DEFAULT 0,
  cards_played integer NOT NULL DEFAULT 0,
  uno_calls integer NOT NULL DEFAULT 0,
  favorite_color text DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stats" ON public.player_stats
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own stats" ON public.player_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON public.player_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime for friends
ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
