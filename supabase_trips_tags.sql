-- Travel collections and tags for Maplog.
-- Run once in Supabase Dashboard > SQL Editor before deploying this feature.

CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  start_date DATE,
  end_date DATE,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.trip_places (
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, place_id)
);

CREATE TABLE IF NOT EXISTS public.place_tags (
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, tag_id)
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own trips" ON public.trips;
DROP POLICY IF EXISTS "Users manage own tags" ON public.tags;
DROP POLICY IF EXISTS "Users manage own trip places" ON public.trip_places;
DROP POLICY IF EXISTS "Users manage own place tags" ON public.place_tags;

CREATE POLICY "Users manage own trips" ON public.trips
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users manage own tags" ON public.tags
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users manage own trip places" ON public.trip_places
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.places p WHERE p.id = place_id AND p.user_id = (select auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.places p WHERE p.id = place_id AND p.user_id = (select auth.uid()))
  );

CREATE POLICY "Users manage own place tags" ON public.place_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.places p WHERE p.id = place_id AND p.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.places p WHERE p.id = place_id AND p.user_id = (select auth.uid())));

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS tags_user_id_idx ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS trip_places_place_id_idx ON public.trip_places(place_id);
CREATE INDEX IF NOT EXISTS place_tags_place_id_idx ON public.place_tags(place_id);

REVOKE ALL ON public.trips, public.tags, public.trip_places, public.place_tags FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips, public.tags, public.trip_places, public.place_tags TO authenticated;
