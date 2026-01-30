const { pgTable, varchar, text, timestamp, boolean, uuid } = require("drizzle-orm/pg-core");
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

module.exports = {
  adminUsers,
  rssSources,
  aiPrompts,
};
