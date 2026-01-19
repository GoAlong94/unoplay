-- Fix RLS recursion on player_hands and allow lobby participants to read/update hands

-- Ensure RLS is enabled
ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;

-- Drop problematic/overly-permissive policies (if they exist)
DROP POLICY IF EXISTS "Players can update their own hand" ON public.player_hands;
DROP POLICY IF EXISTS "Players can view other players' card counts" ON public.player_hands;
DROP POLICY IF EXISTS "Players can view their own hand" ON public.player_hands;
DROP POLICY IF EXISTS "System can insert player hands" ON public.player_hands;

-- Allow any lobby participant in the game's lobby to SELECT hands (client only shows opponents' counts)
CREATE POLICY "Players can view hands in their game"
ON public.player_hands
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.games g
    JOIN public.lobby_players lp ON lp.lobby_id = g.lobby_id
    WHERE g.id = player_hands.game_id
      AND lp.user_id = auth.uid()
  )
);

-- Allow the lobby host (who creates the game) to INSERT initial hands for all players
CREATE POLICY "Host can deal hands"
ON public.player_hands
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.games g
    JOIN public.lobbies l ON l.id = g.lobby_id
    WHERE g.id = player_hands.game_id
      AND l.created_by = auth.uid()
  )
);

-- Allow any lobby participant to UPDATE hands in that game (needed for draw2/+4 effects)
CREATE POLICY "Players can update hands in their game"
ON public.player_hands
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.games g
    JOIN public.lobby_players lp ON lp.lobby_id = g.lobby_id
    WHERE g.id = player_hands.game_id
      AND lp.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.games g
    JOIN public.lobby_players lp ON lp.lobby_id = g.lobby_id
    WHERE g.id = player_hands.game_id
      AND lp.user_id = auth.uid()
  )
);
