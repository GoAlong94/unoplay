-- Add foreign key relationship from player_hands to profiles
ALTER TABLE public.player_hands
ADD CONSTRAINT player_hands_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;