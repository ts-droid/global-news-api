-- Add source_details column to news_events
-- Stores JSON array of source info: [{name, url, pubDate}]
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS source_details TEXT;
