-- Migration: Add tags, translations, and device tokens tables
-- Created: 2026-01-31
-- Purpose: Smart Tag System, Translation Cache, Push Notifications

-- Tags table - Named entities extracted from articles
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('person', 'place', 'organization', 'topic')),
    normalized_name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2), -- ISO 3166-1 alpha-2 for place tags
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index for fast lookups by normalized name and type
CREATE INDEX IF NOT EXISTS idx_tags_normalized_type ON tags(normalized_name, type);
CREATE INDEX IF NOT EXISTS idx_tags_country_code ON tags(country_code) WHERE country_code IS NOT NULL;

-- Event-Tag junction table
CREATE TABLE IF NOT EXISTS event_tags (
    event_id UUID NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    relevance_score REAL DEFAULT 1.0,
    PRIMARY KEY (event_id, tag_id)
);

-- Index for finding all tags for an event
CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_id);

-- Event Translations - Cached translations per language
CREATE TABLE IF NOT EXISTS event_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
    language VARCHAR(5) NOT NULL,
    title VARCHAR(500) NOT NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(event_id, language)
);

-- Index for finding translations by event and language
CREATE INDEX IF NOT EXISTS idx_event_translations_event_lang ON event_translations(event_id, language);

-- Device Tokens - For push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(200) NOT NULL UNIQUE,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
    is_active BOOLEAN DEFAULT true NOT NULL,
    notify_breaking BOOLEAN DEFAULT true NOT NULL,
    preferred_language VARCHAR(5) DEFAULT 'sv',
    focus_countries TEXT, -- JSON array of ISO country codes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index for finding active devices
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(is_active) WHERE is_active = true;
