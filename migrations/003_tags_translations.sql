-- Migration 003: Tags and Translations tables
-- Run this manually via Railway CLI or Dashboard

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  country_code VARCHAR(2),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Event-Tags junction table
CREATE TABLE IF NOT EXISTS event_tags (
  event_id UUID NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 1.0,
  PRIMARY KEY (event_id, tag_id)
);

-- Event Translations table
CREATE TABLE IF NOT EXISTS event_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
  language VARCHAR(5) NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(event_id, language)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_normalized_name ON tags(normalized_name);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);
CREATE INDEX IF NOT EXISTS idx_event_tags_event_id ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag_id ON event_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_event_translations_event_id ON event_translations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_translations_language ON event_translations(language);
