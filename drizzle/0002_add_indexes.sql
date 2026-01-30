-- Add indexes for better query performance
-- Migration: 0002_add_indexes

-- Index on articleHash for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_articles_article_hash ON articles(article_hash);

-- Index on pubDate for sorting (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);

-- Index on createdAt for filtering by when article was added
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);

-- Index on category for filtering
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

-- Index on region for filtering
CREATE INDEX IF NOT EXISTS idx_articles_region ON articles(region);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_articles_category_region ON articles(category, region);

-- Index on sourceCode for source lookups
CREATE INDEX IF NOT EXISTS idx_articles_source_code ON articles(source_code);

-- Index on isBreaking for breaking news queries
CREATE INDEX IF NOT EXISTS idx_articles_is_breaking ON articles(is_breaking) WHERE is_breaking = true;

-- Index on rss_sources code for lookups
CREATE INDEX IF NOT EXISTS idx_rss_sources_code ON rss_sources(code);

-- Index on admin_users email for login lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
