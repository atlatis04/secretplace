-- Self-service account deletion for Maplog.
-- Run once in Supabase Dashboard > SQL Editor before deploying the UI.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requesting_user_id uuid := (SELECT auth.uid());
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to delete an account';
  END IF;

  -- Delete application data not guaranteed to be covered by foreign-key cascades.
  DELETE FROM public.shared_links WHERE user_id = requesting_user_id;
  DELETE FROM public.user_pin_settings WHERE user_id = requesting_user_id;
  DELETE FROM public.posts WHERE user_id = requesting_user_id;

  -- Deleting auth.users removes linked profiles, places, trips, tags, and their
  -- linking rows through the foreign keys defined in this project.
  DELETE FROM auth.users WHERE id = requesting_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
