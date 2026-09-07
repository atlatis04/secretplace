-- Close direct read access to public.places.
--
-- Problem this fixes: places are saved with is_public = true, and the SELECT
-- policy on public.places allows reading any public row. Anyone holding the
-- publishable key - including a signed-out visitor - can therefore list every
-- user's saved places straight from the REST API, with no share link involved.
--
-- After this runs, a place is readable only by its owner, or through a valid
-- share token via get_shared_places(). Run once in Supabase Dashboard >
-- SQL Editor. The app already calls get_shared_places() and falls back to the
-- old query when it is missing, so deploying the app before or after this is
-- equally safe.

-- 1. Shared-mode reads go through one token-validating function.
CREATE OR REPLACE FUNCTION public.get_shared_places(share_token TEXT)
RETURNS SETOF public.places
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  link public.share_tokens%ROWTYPE;
BEGIN
  SELECT * INTO link
  FROM public.share_tokens
  WHERE token = share_token
    AND is_active IS TRUE
    AND (expires_at IS NULL OR expires_at >= now());

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.places p
  WHERE p.user_id = link.user_id
    AND p.is_public IS TRUE
    -- A filtered share names its places; a full share leaves the column NULL.
    AND (link.place_ids IS NULL OR p.id = ANY (link.place_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_places(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_places(TEXT) TO anon, authenticated;

-- 2. Replace every existing SELECT policy on places with an owner-only one.
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'places'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.places', policy_name);
  END LOOP;
END;
$$;

CREATE POLICY "Users read own places" ON public.places
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- 3. Verify. Signed out, this must return zero rows; the app's shared links
--    keep working because they now go through get_shared_places().
--
--    SELECT count(*) FROM public.places;
