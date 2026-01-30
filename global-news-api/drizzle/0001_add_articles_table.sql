-- Add articles table for persistent storage of translated news
CREATE TABLE IF NOT EXISTS "articles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "article_hash" varchar(64) UNIQUE NOT NULL,

    -- Original content
    "title" text NOT NULL,
    "description" text,
    "content" text,
    "link" text NOT NULL,
    "image_url" text,
    "pub_date" timestamp,
    "author" varchar(255),

    -- Source info
    "source_code" varchar(50) NOT NULL,
    "source_name" varchar(200) NOT NULL,
    "category" varchar(50),
    "region" varchar(50),
    "language" varchar(10) DEFAULT 'en',

    -- Swedish translations (AI-generated)
    "title_sv" text,
    "summary_sv" text,
    "is_translated" boolean DEFAULT false NOT NULL,

    -- Metadata
    "is_breaking" boolean DEFAULT false NOT NULL,
    "reading_time" integer DEFAULT 3,

    -- Timestamps
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "articles_created_at_idx" ON "articles" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "articles_category_idx" ON "articles" ("category");
CREATE INDEX IF NOT EXISTS "articles_region_idx" ON "articles" ("region");
CREATE INDEX IF NOT EXISTS "articles_source_code_idx" ON "articles" ("source_code");

-- Full-text search indexes for Swedish and English content
CREATE INDEX IF NOT EXISTS "articles_title_search_idx" ON "articles" USING gin(to_tsvector('english', "title"));
CREATE INDEX IF NOT EXISTS "articles_title_sv_search_idx" ON "articles" USING gin(to_tsvector('swedish', COALESCE("title_sv", '')));
