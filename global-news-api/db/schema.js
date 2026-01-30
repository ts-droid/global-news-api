const { pgTable, varchar, text, timestamp, boolean, uuid, integer } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

// Articles - persistently stored translated news articles
const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleHash: varchar("article_hash", { length: 64 }).unique().notNull(), // SHA256 of link for deduplication

  // Original content
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"),
  link: text("link").notNull(),
  imageUrl: text("image_url"),
  pubDate: timestamp("pub_date"),
  author: varchar("author", { length: 255 }),

  // Source info
  sourceCode: varchar("source_code", { length: 50 }).notNull(),
  sourceName: varchar("source_name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }),
  region: varchar("region", { length: 50 }),
  language: varchar("language", { length: 10 }).default("en"),

  // Swedish translations (AI-generated)
  titleSv: text("title_sv"),
  summarySv: text("summary_sv"),
  isTranslated: boolean("is_translated").default(false).notNull(),

  // Metadata
  isBreaking: boolean("is_breaking").default(false).notNull(),
  readingTime: integer("reading_time").default(3),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

module.exports = {
  articles,
  adminUsers,
  rssSources,
  aiPrompts,
};
