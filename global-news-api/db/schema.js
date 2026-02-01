const { pgTable, varchar, text, timestamp, boolean, uuid, integer } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

// ============================================
// ARTICLES
// ============================================

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
  subcategory: varchar("subcategory", { length: 50 }), // NEW: sub-category
  region: varchar("region", { length: 50 }),
  countryIso: varchar("country_iso", { length: 3 }), // NEW: ISO country code
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

// ============================================
// ADMIN USERS (for dashboard access)
// ============================================

const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  forcePasswordChange: boolean("force_password_change").default(true).notNull(),
  totpSecret: text("totp_secret"), // Base32 encoded secret for Google Authenticator
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(), // Can create new admins
  lastLogin: timestamp("last_login"),
  // Password reset fields
  resetToken: varchar("reset_token", { length: 64 }),
  resetTokenExpires: timestamp("reset_token_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// APP USERS (end users with SSO)
// ============================================

const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),

  // Authentication
  authProvider: varchar("auth_provider", { length: 20 }).notNull(), // 'email', 'apple', 'google'
  authProviderId: varchar("auth_provider_id", { length: 255 }), // External ID from Apple/Google
  passwordHash: text("password_hash"), // Only for email auth

  // Profile
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatar_url"),

  // Settings
  language: varchar("language", { length: 10 }).default("sv").notNull(),
  pushToken: text("push_token"), // For push notifications

  // Onboarding
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),

  // Tokens
  refreshToken: text("refresh_token"),
  refreshTokenExpires: timestamp("refresh_token_expires"),

  // Timestamps
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// USER PREFERENCES
// ============================================

// User category preferences - which categories the user follows
const userCategoryPreferences = pgTable("user_category_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryCode: varchar("category_code", { length: 50 }).notNull(),
  subcategoryCode: varchar("subcategory_code", { length: 50 }), // Optional specific subcategory
  isEnabled: boolean("is_enabled").default(true).notNull(),
  notificationEnabled: boolean("notification_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User location preferences - which countries the user follows
const userLocationPreferences = pgTable("user_location_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  countryIso: varchar("country_iso", { length: 3 }).notNull(),
  isHomeCountry: boolean("is_home_country").default(false).notNull(), // User's primary country for "local" news
  notificationEnabled: boolean("notification_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// RSS SOURCES
// ============================================

const rssSources = pgTable("rss_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  subcategory: varchar("subcategory", { length: 50 }), // NEW
  region: varchar("region", { length: 50 }).notNull(),
  continentCode: varchar("continent_code", { length: 20 }), // NEW
  countryIso: varchar("country_iso", { length: 3 }), // NEW: specific country
  language: varchar("language", { length: 10 }).default("en"),
  rssUrl: text("rss_url").notNull(),
  website: text("website"),
  isActive: boolean("is_active").default(true).notNull(),
  lastFetched: timestamp("last_fetched"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// AI PROMPTS
// ============================================

// Base AI prompts (system instructions per language)
const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: varchar("category", { length: 50 }).unique().notNull(), // 'base', 'world', 'politics', etc.
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Style overlays - category + language specific writing style instructions
const aiStyleOverlays = pgTable("ai_style_overlays", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryCode: varchar("category_code", { length: 50 }).notNull(), // 'world', 'sports', 'business', etc.
  language: varchar("language", { length: 10 }).notNull(), // 'sv', 'en', etc.

  // Style overlay content
  name: varchar("name", { length: 100 }).notNull(), // Human-readable name, e.g. "Sportsreporter - Svenska"
  stylePrompt: text("style_prompt").notNull(), // The actual style instructions
  description: text("description"), // Admin notes about this style

  // Example for testing
  exampleInput: text("example_input"), // Sample article to test
  exampleOutput: text("example_output"), // Expected style output

  // Status
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// CATEGORIES (reference data, seeded from constants)
// ============================================

const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  nameSv: varchar("name_sv", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  descriptionSv: text("description_sv"),
  descriptionEn: text("description_en"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 10 }),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const subcategories = pgTable("subcategories", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryCode: varchar("category_code", { length: 50 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  nameSv: varchar("name_sv", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// GEOGRAPHY (reference data, seeded from constants)
// ============================================

const continents = pgTable("continents", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 20 }).unique().notNull(),
  nameSv: varchar("name_sv", { length: 50 }).notNull(),
  nameEn: varchar("name_en", { length: 50 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  isoCode: varchar("iso_code", { length: 3 }).unique().notNull(),
  continentCode: varchar("continent_code", { length: 20 }).notNull(),
  nameSv: varchar("name_sv", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  flagEmoji: varchar("flag_emoji", { length: 10 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

module.exports = {
  // Core tables
  articles,
  adminUsers,
  users,
  rssSources,
  aiPrompts,
  aiStyleOverlays,

  // User preferences
  userCategoryPreferences,
  userLocationPreferences,

  // Reference data
  categories,
  subcategories,
  continents,
  countries,
};
