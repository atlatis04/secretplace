-- Create share_tokens table for time-limited share links
CREATE TABLE IF NOT EXISTS share_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(32) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_user_id ON share_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_expires_at ON share_tokens(expires_at);

-- Enable Row Level Security
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own share tokens" ON share_tokens;
DROP POLICY IF EXISTS "Users can create share tokens" ON share_tokens;
DROP POLICY IF EXISTS "Users can update own share tokens" ON share_tokens;
DROP POLICY IF EXISTS "Users can delete own share tokens" ON share_tokens;
DROP POLICY IF EXISTS "Anyone can validate active tokens" ON share_tokens;

-- Policy: Users can view their own tokens
CREATE POLICY "Users can view own share tokens"
    ON share_tokens FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can create their own tokens
CREATE POLICY "Users can create share tokens"
    ON share_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own tokens
CREATE POLICY "Users can update own share tokens"
    ON share_tokens FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own tokens
CREATE POLICY "Users can delete own share tokens"
    ON share_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Anyone can read active, non-expired tokens (for validation)
CREATE POLICY "Anyone can validate active tokens"
    ON share_tokens FOR SELECT
    USING (is_active = TRUE AND expires_at > NOW());
