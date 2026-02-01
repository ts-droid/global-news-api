/**
 * Manual Schema Migration Script
 * Creates all new tables for the onboarding system
 *
 * Run: DATABASE_URL="..." node scripts/migrate-schema.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('Starting schema migration...\n');

  const migrations = [
    // Add new columns to articles
    {
      name: 'Add subcategory to articles',
      sql: `ALTER TABLE articles ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50);`
    },
    {
      name: 'Add country_iso to articles',
      sql: `ALTER TABLE articles ADD COLUMN IF NOT EXISTS country_iso VARCHAR(3);`
    },

    // Add new columns to rss_sources
    {
      name: 'Add subcategory to rss_sources',
      sql: `ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50);`
    },
    {
      name: 'Add continent_code to rss_sources',
      sql: `ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS continent_code VARCHAR(20);`
    },
    {
      name: 'Add country_iso to rss_sources',
      sql: `ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS country_iso VARCHAR(3);`
    },

    // Create users table
    {
      name: 'Create users table',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          auth_provider VARCHAR(20) NOT NULL,
          auth_provider_id VARCHAR(255),
          password_hash TEXT,
          name VARCHAR(255),
          avatar_url TEXT,
          language VARCHAR(10) DEFAULT 'sv' NOT NULL,
          push_token TEXT,
          onboarding_completed BOOLEAN DEFAULT false NOT NULL,
          refresh_token TEXT,
          refresh_token_expires TIMESTAMP,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create user_category_preferences table
    {
      name: 'Create user_category_preferences table',
      sql: `
        CREATE TABLE IF NOT EXISTS user_category_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          category_code VARCHAR(50) NOT NULL,
          subcategory_code VARCHAR(50),
          is_enabled BOOLEAN DEFAULT true NOT NULL,
          notification_enabled BOOLEAN DEFAULT false NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create user_location_preferences table
    {
      name: 'Create user_location_preferences table',
      sql: `
        CREATE TABLE IF NOT EXISTS user_location_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          country_iso VARCHAR(3) NOT NULL,
          is_home_country BOOLEAN DEFAULT false NOT NULL,
          notification_enabled BOOLEAN DEFAULT false NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create categories table
    {
      name: 'Create categories table',
      sql: `
        CREATE TABLE IF NOT EXISTS categories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(50) UNIQUE NOT NULL,
          name_sv VARCHAR(100) NOT NULL,
          name_en VARCHAR(100) NOT NULL,
          description_sv TEXT,
          description_en TEXT,
          icon VARCHAR(50),
          color VARCHAR(10),
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create subcategories table
    {
      name: 'Create subcategories table',
      sql: `
        CREATE TABLE IF NOT EXISTS subcategories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category_code VARCHAR(50) NOT NULL,
          code VARCHAR(50) NOT NULL,
          name_sv VARCHAR(100) NOT NULL,
          name_en VARCHAR(100) NOT NULL,
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create continents table
    {
      name: 'Create continents table',
      sql: `
        CREATE TABLE IF NOT EXISTS continents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(20) UNIQUE NOT NULL,
          name_sv VARCHAR(50) NOT NULL,
          name_en VARCHAR(50) NOT NULL,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create countries table
    {
      name: 'Create countries table',
      sql: `
        CREATE TABLE IF NOT EXISTS countries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          iso_code VARCHAR(3) UNIQUE NOT NULL,
          continent_code VARCHAR(20) NOT NULL,
          name_sv VARCHAR(100) NOT NULL,
          name_en VARCHAR(100) NOT NULL,
          flag_emoji VARCHAR(10),
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `
    },

    // Create indexes
    {
      name: 'Create index on articles.subcategory',
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_subcategory ON articles(subcategory);`
    },
    {
      name: 'Create index on articles.country_iso',
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_country_iso ON articles(country_iso);`
    },
    {
      name: 'Create index on user_category_preferences.user_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_user_cat_prefs_user_id ON user_category_preferences(user_id);`
    },
    {
      name: 'Create index on user_location_preferences.user_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_user_loc_prefs_user_id ON user_location_preferences(user_id);`
    }
  ];

  for (const migration of migrations) {
    try {
      await pool.query(migration.sql);
      console.log(`✓ ${migration.name}`);
    } catch (error) {
      if (error.code === '42P07' || error.code === '42701') {
        // Table/column already exists
        console.log(`= ${migration.name} (already exists)`);
      } else {
        console.error(`✗ ${migration.name}: ${error.message}`);
      }
    }
  }

  console.log('\nMigration complete!');
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
