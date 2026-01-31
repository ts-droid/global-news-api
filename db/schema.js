const { pgTable, varchar, text, timestamp, boolean, uuid, integer } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

// Admin users - separate authentication system for dashboard access
const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  forcePasswordChange: boolean("force_password_change").default(true).notNull(),
  totpSecret: text("totp_secret"), // Base32 encoded secret for Google Authenticator
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(), // Can create new admins
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// RSS sources - dynamic list of feeds
const rssSources = pgTable("rss_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  region: varchar("region", { length: 50 }).notNull(),
  country: varchar("country", { length: 10 }),
  language: varchar("language", { length: 10 }).default("en"),
  rssUrl: text("rss_url").notNull(),
  website: text("website"),
  isActive: boolean("is_active").default(true).notNull(),
  lastFetched: timestamp("last_fetched"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Prompts - category-specific instructions
const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: varchar("category", { length: 50 }).unique().notNull(), // 'base', 'world', 'politics', etc.
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// News Events - Groups related articles about the same story
const newsEvents = pgTable("news_events", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Event summary (AI-generated, combines all sources)
  title: text("title").notNull(), // Combined headline
  summary: text("summary").notNull(), // Combined summary from all sources

  // Metadata
  category: varchar("category", { length: 50 }).notNull(),
  region: varchar("region", { length: 50 }),

  // Status
  isBreaking: boolean("is_breaking").default(false).notNull(),
  sourceCount: integer("source_count").default(1).notNull(), // Number of articles about this event

  // Source details (JSON array: [{name, url, pubDate}])
  sourceDetails: text("source_details"), // JSON array of source info

  // Timestamps
  firstReportedAt: timestamp("first_reported_at").notNull(), // When first article was published
  lastUpdatedAt: timestamp("last_updated_at").notNull(), // When last article was added
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Articles - Persistent storage for news items
const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleHash: varchar("article_hash", { length: 64 }).unique().notNull(), // MD5 of link+title for deduplication
  sourceId: uuid("source_id").references(() => rssSources.id),
  sourceCode: varchar("source_code", { length: 50 }).notNull(),
  
  // Original Content
  title: text("title").notNull(),
  link: text("link").notNull(),
  description: text("description"), // Original summary/snippet
  content: text("content"), // Full content if available
  pubDate: timestamp("pub_date").notNull(),
  imageUrl: text("image_url"),
  author: varchar("author", { length: 255 }),
  
  // Event linkage (for deduplication/grouping)
  eventId: uuid("event_id").references(() => newsEvents.id),
  isPrimarySource: boolean("is_primary_source").default(false).notNull(), // First article for this event

  // Metadata
  category: varchar("category", { length: 50 }).notNull(),
  region: varchar("region", { length: 50 }).notNull(),
  language: varchar("language", { length: 10 }).default("en"),
  
  // Localized/AI Content
  isTranslated: boolean("is_translated").default(false).notNull(),
  titleSv: text("title_sv"),
  summarySv: text("summary_sv"),
  explanationSv: text("explanation_sv"), // Cached "Explain this" content
  readingTime: varchar("reading_time", { length: 10 }), // e.g. "4 min"
  isBreaking: boolean("is_breaking").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

module.exports = {
  adminUsers,
  rssSources,
  aiPrompts,
  newsEvents,
  articles,
};
