
-- Add missing RLS policies (some already exist from prior migration)

-- player_stats policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Anyone can view player stats') THEN
    ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Anyone can view player stats" ON public.player_stats FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can insert their own stats') THEN
    CREATE POLICY "Users can insert their own stats" ON public.player_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can update their own stats') THEN
    CREATE POLICY "Users can update their own stats" ON public.player_stats FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- friends: add missing policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can view their own friendships') THEN
    CREATE POLICY "Users can view their own friendships" ON public.friends FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can update friendships they are part of') THEN
    CREATE POLICY "Users can update friendships they are part of" ON public.friends FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can delete their own friendships') THEN
    CREATE POLICY "Users can delete their own friendships" ON public.friends FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
END $$;

-- Unique constraint (ignore if exists)
DO $$
BEGIN
  ALTER TABLE public.friends ADD CONSTRAINT friends_unique_pair UNIQUE (user_id, friend_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
