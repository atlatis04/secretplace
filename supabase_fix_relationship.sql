-- Add foreign key relationship from posts to profiles
-- This allows Supabase to join the tables automatically
ALTER TABLE public.posts
ADD CONSTRAINT fk_posts_profiles
FOREIGN KEY (user_id)
REFERENCES public.profiles(id);
