-- Backfill profiles for existing users who don't have a profile yet
-- This script creates profiles with random nicknames for all existing users

DO $$
DECLARE
  user_record RECORD;
  random_nickname TEXT;
  adjectives TEXT[] := ARRAY['Happy', 'Swift', 'Brave', 'Clever', 'Gentle', 'Bright', 'Cool', 'Wild', 'Smart', 'Lucky'];
  nouns TEXT[] := ARRAY['Panda', 'Tiger', 'Eagle', 'Fox', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Dragon', 'Phoenix'];
  random_num INTEGER;
BEGIN
  -- Loop through all users who don't have a profile
  FOR user_record IN 
    SELECT id 
    FROM auth.users 
    WHERE id NOT IN (SELECT id FROM profiles)
  LOOP
    -- Generate random nickname
    random_nickname := adjectives[1 + floor(random() * array_length(adjectives, 1))::int] || 
                       ' ' || 
                       nouns[1 + floor(random() * array_length(nouns, 1))::int] || 
                       ' ' || 
                       floor(random() * 100)::text;
    
    -- Insert profile for this user
    INSERT INTO profiles (id, nickname)
    VALUES (user_record.id, random_nickname)
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Created profile for user % with nickname: %', user_record.id, random_nickname;
  END LOOP;
END $$;

-- Verify the results
SELECT 
  COUNT(*) as total_users,
  (SELECT COUNT(*) FROM profiles) as users_with_profiles
FROM auth.users;
