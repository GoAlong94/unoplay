-- Allow lobby participants to delete games for returning to lobby
CREATE POLICY "Players in lobby can delete game"
ON public.games
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.lobby_players lp
    WHERE lp.lobby_id = games.lobby_id
    AND lp.user_id = auth.uid()
  )
);

-- Allow lobby participants to delete player hands for cleanup
CREATE POLICY "Players can delete hands in their game"
ON public.player_hands
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.games g
    JOIN public.lobby_players lp ON lp.lobby_id = g.lobby_id
    WHERE g.id = player_hands.game_id
    AND lp.user_id = auth.uid()
  )
);