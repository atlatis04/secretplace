-- Create profiles table for user nicknames
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nickname TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Policy: Anyone can view all profiles (for displaying nicknames)
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Function to create profile with random nickname on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  random_nickname TEXT;
  adjectives TEXT[] := ARRAY['Happy', 'Swift', 'Brave', 'Clever', 'Gentle', 'Bright', 'Cool', 'Wild', 'Smart', 'Lucky'];
  nouns TEXT[] := ARRAY['Panda', 'Tiger', 'Eagle', 'Fox', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Dragon', 'Phoenix'];
  random_num INTEGER;
BEGIN
  -- Generate random nickname
  random_nickname := adjectives[1 + floor(random() * array_length(adjectives, 1))::int] || 
                     ' ' || 
                     nouns[1 + floor(random() * array_length(nouns, 1))::int] || 
                     ' ' || 
                     floor(random() * 100)::text;
  
  -- Insert profile with random nickname
  INSERT INTO public.profiles (id, nickname)
  VALUES (NEW.id, random_nickname);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create index on nickname for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);
