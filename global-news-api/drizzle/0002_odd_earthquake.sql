CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_hash" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text,
	"link" text NOT NULL,
	"image_url" text,
	"pub_date" timestamp,
	"author" varchar(255),
	"source_code" varchar(50) NOT NULL,
	"source_name" varchar(200) NOT NULL,
	"category" varchar(50),
	"region" varchar(50),
	"language" varchar(10) DEFAULT 'en',
	"title_sv" text,
	"summary_sv" text,
	"is_translated" boolean DEFAULT false NOT NULL,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"reading_time" integer DEFAULT 3,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "articles_article_hash_unique" UNIQUE("article_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "reset_token" varchar(64);--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "reset_token_expires" timestamp;