-- Create news_events table for grouping related articles
CREATE TABLE IF NOT EXISTS "news_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"region" varchar(50),
	"is_breaking" boolean DEFAULT false NOT NULL,
	"source_count" integer DEFAULT 1 NOT NULL,
	"first_reported_at" timestamp NOT NULL,
	"last_updated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add event linkage columns to articles table
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "event_id" uuid;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "is_primary_source" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Add foreign key constraint
ALTER TABLE "articles" ADD CONSTRAINT "articles_event_id_news_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."news_events"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "news_events_category_idx" ON "news_events" ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_events_last_updated_idx" ON "news_events" ("last_updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_event_id_idx" ON "articles" ("event_id");
