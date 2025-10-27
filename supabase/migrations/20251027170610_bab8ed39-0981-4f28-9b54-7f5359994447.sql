-- Create enum for game status
CREATE TYPE game_status AS ENUM ('waiting', 'in_progress', 'completed');

-- Create games table to store game state
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id UUID NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  status game_status NOT NULL DEFAULT 'waiting',
  current_card TEXT NOT NULL, -- Format: "R5" (red 5), "B_SKIP", "WILD", etc.
  current_color TEXT, -- For wild cards: red, blue, green, yellow
  direction INTEGER NOT NULL DEFAULT 1, -- 1 for clockwise, -1 for counter-clockwise
  current_turn_user_id UUID NOT NULL,
  deck JSONB NOT NULL DEFAULT '[]'::jsonb, -- Remaining cards in draw pile
  discard_pile JSONB NOT NULL DEFAULT '[]'::jsonb, -- Played cards
  winner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create player hands table
CREATE TABLE public.player_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb, -- Player's cards
  position INTEGER NOT NULL, -- Turn order position
  has_said_uno BOOLEAN DEFAULT false,
  UNIQUE(game_id, user_id)
);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;

-- RLS Policies for games table
CREATE POLICY "Anyone can view games"
  ON public.games FOR SELECT
  USING (true);

CREATE POLICY "Lobby creator can create games"
  ON public.games FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lobbies
      WHERE lobbies.id = lobby_id AND lobbies.created_by = auth.uid()
    )
  );

CREATE POLICY "Players in lobby can update game"
  ON public.games FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lobby_players
      WHERE lobby_players.lobby_id = games.lobby_id
      AND lobby_players.user_id = auth.uid()
    )
  );

-- RLS Policies for player_hands table
CREATE POLICY "Players can view their own hand"
  ON public.player_hands FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Players can view other players' card counts"
  ON public.player_hands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.player_hands AS ph
      WHERE ph.game_id = player_hands.game_id
      AND ph.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert player hands"
  ON public.player_hands FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update their own hand"
  ON public.player_hands FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_hands;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_game_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION update_game_updated_at();