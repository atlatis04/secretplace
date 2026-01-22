-- Update profiles table RLS to allow public access to nicknames
-- This is necessary for shared links to display the sharer's nickname to unauthenticated users.

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Create a new policy that allows anyone (including anon) to view nicknames
CREATE POLICY "Anyone can view all profiles"
  ON profiles FOR SELECT
  USING (true);
