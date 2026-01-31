const { pgTable, varchar, text, timestamp, boolean, uuid, integer, real, primaryKey, unique } = require("drizzle-orm/pg-core");
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

  // TODO: sourceDetails will be added after migration runs on Railway
  // sourceDetails: text("source_details"), // JSON array: [{name, url, pubDate}]

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

// Tags - Named entities extracted from articles (people, places, organizations, topics)
const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // person, place, organization, topic
  normalizedName: varchar("normalized_name", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }), // ISO 3166-1 alpha-2 (SE, US, GB, IN) - for place tags
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Event-Tag junction table - Links events to their tags
const eventTags = pgTable("event_tags", {
  eventId: uuid("event_id").references(() => newsEvents.id, { onDelete: "cascade" }).notNull(),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
  relevanceScore: real("relevance_score").default(1.0),
}, (table) => ({
  pk: primaryKey({ columns: [table.eventId, table.tagId] }),
}));

// Event Translations - Cached translations per language
const eventTranslations = pgTable("event_translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => newsEvents.id, { onDelete: "cascade" }).notNull(),
  language: varchar("language", { length: 5 }).notNull(), // sv, en, de, fr, etc.
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  unq: unique().on(table.eventId, table.language),
}));

// Device Tokens - For push notifications
const deviceTokens = pgTable("device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: varchar("token", { length: 200 }).notNull().unique(),
  platform: varchar("platform", { length: 10 }).notNull(), // ios, android
  isActive: boolean("is_active").default(true).notNull(),
  notifyBreaking: boolean("notify_breaking").default(true).notNull(),
  preferredLanguage: varchar("preferred_language", { length: 5 }).default("sv"),
  focusCountries: text("focus_countries"), // JSON array of ISO country codes
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
});

module.exports = {
  adminUsers,
  rssSources,
  aiPrompts,
  newsEvents,
  articles,
  tags,
  eventTags,
  eventTranslations,
  deviceTokens,
};
