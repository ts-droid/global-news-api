const { db } = require('./index');
const { sql } = require('drizzle-orm');

async function ensureSchema() {
  console.log('--- Checking Database Schema ---');
  try {
    // Check if articles table exists
    const checkFn = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'articles'
      );
    `);
    
    // Postgres returns [{ exists: true }] or similar
    // We can just try to create IF NOT EXISTS which is safer
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS articles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        article_hash varchar(64) NOT NULL UNIQUE,
        source_id uuid REFERENCES rss_sources(id),
        source_code varchar(50) NOT NULL,
        title text NOT NULL,
        link text NOT NULL,
        description text,
        content text,
        pub_date timestamp NOT NULL,
        image_url text,
        author varchar(255),
        category varchar(50) NOT NULL,
        region varchar(50) NOT NULL,
        language varchar(10) DEFAULT 'en',
        is_translated boolean DEFAULT false NOT NULL,
        title_sv text,
        summary_sv text,
        explanation_sv text,
        reading_time varchar(10),
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);
    
    console.log('✓ Schema check passed (articles table verified)');
  } catch (error) {
    console.error('Schema check failed:', error);
    // Don't kill process, let it try to run - maybe table exists
  }
}

module.exports = { ensureSchema };
