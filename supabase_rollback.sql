-- Rollback Script for User Profiles
-- This will remove all database objects created by supabase_migration_user_profiles.sql

-- Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;

-- Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- Drop table (this will also drop all RLS policies and indexes)
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Verify cleanup
SELECT 'Rollback completed successfully. user_profiles table and related objects have been removed.' AS status;
