-- Update share_tokens table to store specific place IDs
-- This allows sharing only a filtered subset of places.

ALTER TABLE share_tokens 
ADD COLUMN IF NOT EXISTS place_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN share_tokens.place_ids IS 'List of specific place IDs shared by this token. If NULL, all public places are shared (legacy/full share).';
