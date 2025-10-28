-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Lobby creator can create games" ON public.games;

-- Create new policy: only host (lobby creator) can start games
CREATE POLICY "Only lobby host can create games"
ON public.games
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lobbies l
    WHERE l.id = games.lobby_id 
      AND l.created_by = auth.uid()
  )
);
