-- Migration: Add server settings and translation languages tables
-- Created: 2026-01-31
-- Purpose: Configurable retention, pre-translation languages

-- Server Settings - Key-value store for server configuration
CREATE TABLE IF NOT EXISTS server_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Insert default settings
INSERT INTO server_settings (key, value, description) VALUES
    ('retention_hours', '72', 'How many hours to keep events before cleanup'),
    ('cleanup_interval_hours', '6', 'How often to run cleanup job (in hours)'),
    ('pre_translation_enabled', 'true', 'Whether to pre-translate events in background'),
    ('max_events_to_translate', '30', 'Max number of recent events to pre-translate per run')
ON CONFLICT (key) DO NOTHING;

-- Translation Languages - Which languages to pre-translate
CREATE TABLE IF NOT EXISTS translation_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(5) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    native_name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT false NOT NULL,
    priority INTEGER DEFAULT 10 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Insert supported languages (Swedish active by default)
INSERT INTO translation_languages (code, name, native_name, is_active, priority) VALUES
    ('sv', 'Swedish', 'Svenska', true, 1),
    ('no', 'Norwegian', 'Norsk', false, 2),
    ('da', 'Danish', 'Dansk', false, 3),
    ('fi', 'Finnish', 'Suomi', false, 4),
    ('de', 'German', 'Deutsch', false, 5),
    ('fr', 'French', 'Français', false, 6),
    ('es', 'Spanish', 'Español', false, 7)
ON CONFLICT (code) DO NOTHING;

-- Index for active languages lookup
CREATE INDEX IF NOT EXISTS idx_translation_languages_active ON translation_languages(is_active) WHERE is_active = true;
