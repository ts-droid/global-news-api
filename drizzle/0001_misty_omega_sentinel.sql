CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_hash" varchar(64) NOT NULL,
	"source_id" uuid,
	"source_code" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"description" text,
	"content" text,
	"pub_date" timestamp NOT NULL,
	"image_url" text,
	"author" varchar(255),
	"category" varchar(50) NOT NULL,
	"region" varchar(50) NOT NULL,
	"language" varchar(10) DEFAULT 'en',
	"is_translated" boolean DEFAULT false NOT NULL,
	"title_sv" text,
	"summary_sv" text,
	"explanation_sv" text,
	"reading_time" varchar(10),
	"is_breaking" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "articles_article_hash_unique" UNIQUE("article_hash")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_rss_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rss_sources"("id") ON DELETE no action ON UPDATE no action;