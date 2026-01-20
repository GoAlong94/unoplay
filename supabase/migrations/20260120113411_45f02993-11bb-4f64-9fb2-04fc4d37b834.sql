-- Add game settings columns to lobbies table
ALTER TABLE public.lobbies 
ADD COLUMN IF NOT EXISTS turn_time_seconds integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS game_time_minutes integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS use_double_deck boolean DEFAULT false;