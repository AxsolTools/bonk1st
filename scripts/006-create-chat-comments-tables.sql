-- ============================================================================
-- AQUA Launchpad - Chat & Comments Migration
-- Real-time chat and persistent comments per token
-- ============================================================================

-- ========== TOKEN CHAT (Real-time, Global, Persistent) ==========
CREATE TABLE IF NOT EXISTS token_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  
  -- Message content
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  
  -- Metadata
  username VARCHAR(50),
  avatar_url TEXT,
  
  -- Moderation
  is_hidden BOOLEAN DEFAULT FALSE,
  hidden_by UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== TOKEN COMMENTS (Persistent, Threaded) ==========
CREATE TABLE IF NOT EXISTS token_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  parent_id UUID REFERENCES token_comments(id) ON DELETE CASCADE, -- For replies
  
  -- Comment content
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  
  -- Metadata
  username VARCHAR(50),
  avatar_url TEXT,
  
  -- Engagement
  likes_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  
  -- Edit history
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  original_content TEXT,
  
  -- Moderation
  is_hidden BOOLEAN DEFAULT FALSE,
  hidden_by UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== COMMENT LIKES ==========
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES token_comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(44) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate likes
  CONSTRAINT unique_comment_like UNIQUE (comment_id, wallet_address)
);

-- ========== CHAT STATISTICS (Aggregated) ==========
CREATE TABLE IF NOT EXISTS token_chat_stats (
  token_id UUID PRIMARY KEY REFERENCES tokens(id) ON DELETE CASCADE,
  total_messages INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  unique_chatters INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_comment_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_token ON token_chat(token_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON token_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_wallet ON token_chat(wallet_address);
CREATE INDEX IF NOT EXISTS idx_chat_not_hidden ON token_chat(token_id, created_at DESC) WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_comments_token ON token_comments(token_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON token_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON token_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_hidden ON token_comments(token_id, created_at DESC) WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON comment_likes(user_id);

-- Enable RLS
ALTER TABLE token_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_chat_stats ENABLE ROW LEVEL SECURITY;

-- ========== POLICIES FOR CHAT ==========
-- Anyone can read non-hidden chat messages
CREATE POLICY "Anyone can read chat" ON token_chat
  FOR SELECT USING (is_hidden = FALSE);

-- Authenticated users can insert chat messages
CREATE POLICY "Users can post chat" ON token_chat
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Token creators can hide messages on their token
CREATE POLICY "Creators can moderate chat" ON token_chat
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tokens 
      WHERE tokens.id = token_chat.token_id 
      AND tokens.creator_wallet = current_setting('app.current_wallet', true)
    )
  );

-- ========== POLICIES FOR COMMENTS ==========
-- Anyone can read non-hidden comments
CREATE POLICY "Anyone can read comments" ON token_comments
  FOR SELECT USING (is_hidden = FALSE);

-- Authenticated users can post comments
CREATE POLICY "Users can post comments" ON token_comments
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Users can edit their own comments
CREATE POLICY "Users can edit own comments" ON token_comments
  FOR UPDATE USING (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Token creators can moderate comments
CREATE POLICY "Creators can moderate comments" ON token_comments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tokens 
      WHERE tokens.id = token_comments.token_id 
      AND tokens.creator_wallet = current_setting('app.current_wallet', true)
    )
  );

-- ========== POLICIES FOR LIKES ==========
CREATE POLICY "Anyone can read likes" ON comment_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like comments" ON comment_likes
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

CREATE POLICY "Users can unlike their likes" ON comment_likes
  FOR DELETE USING (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- ========== POLICIES FOR STATS ==========
CREATE POLICY "Anyone can read chat stats" ON token_chat_stats
  FOR SELECT USING (true);

-- ========== TRIGGERS ==========

-- Update comment reply count when reply is added
CREATE OR REPLACE FUNCTION update_comment_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE token_comments SET replies_count = replies_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE token_comments SET replies_count = replies_count - 1 WHERE id = OLD.parent_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_replies_count
  AFTER INSERT OR DELETE ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_replies_count();

-- Update comment likes count
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE token_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE token_comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_likes_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_likes_count();

-- Update token chat stats
CREATE OR REPLACE FUNCTION update_token_chat_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO token_chat_stats (token_id, total_messages, last_message_at)
  VALUES (NEW.token_id, 1, NOW())
  ON CONFLICT (token_id) DO UPDATE SET
    total_messages = token_chat_stats.total_messages + 1,
    last_message_at = NOW(),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_stats_update
  AFTER INSERT ON token_chat
  FOR EACH ROW
  EXECUTE FUNCTION update_token_chat_stats();

-- Update token comment stats
CREATE OR REPLACE FUNCTION update_token_comment_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO token_chat_stats (token_id, total_comments, last_comment_at)
    VALUES (NEW.token_id, 1, NOW())
    ON CONFLICT (token_id) DO UPDATE SET
      total_comments = token_chat_stats.total_comments + 1,
      last_comment_at = NOW(),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_stats_update
  AFTER INSERT ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_token_comment_stats();

-- Trigger for updated_at on comments
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========== ENABLE REALTIME ==========
-- These need to be run separately in Supabase dashboard or via CLI
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_chat;
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_comments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE comment_likes;

