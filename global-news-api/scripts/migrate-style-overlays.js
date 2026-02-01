/**
 * Migration script for ai_style_overlays table
 * Run: node scripts/migrate-style-overlays.js
 */

require('dotenv').config();
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const SQL = `
-- Create ai_style_overlays table
CREATE TABLE IF NOT EXISTS ai_style_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code VARCHAR(50) NOT NULL,
  language VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  style_prompt TEXT NOT NULL,
  description TEXT,
  example_input TEXT,
  example_output TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Unique constraint on category + language combination
  UNIQUE(category_code, language)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_style_overlays_category_lang
ON ai_style_overlays(category_code, language);

-- Insert default Swedish style overlays for each category
INSERT INTO ai_style_overlays (category_code, language, name, style_prompt, description)
VALUES
  ('world', 'sv', 'Världsreporter - Svenska',
   'Skriv som en erfaren utrikeskorrespondent. Förklara geopolitiska sammanhang tydligt. Namnge alla länder, städer och nyckelpersoner. Ge kontext för internationella relationer och historiska samband.',
   'Stil för världsnyheter - formell, informativ, kontextuell'),

  ('politics', 'sv', 'Politisk reporter - Svenska',
   'Skriv som en politisk journalist. Var objektiv och balanserad. Namnge politiker, partier och specifika beslut. Förklara politiska processer och konsekvenser för medborgare.',
   'Stil för politiska nyheter - objektiv, förklarande'),

  ('sports', 'sv', 'Sportsreporter - Svenska',
   'Skriv med energi och entusiasm som en sportkommentator. Inkludera exakta resultat, namn på lag och spelare. Fånga spänningen i matchen. Använd sportjargong naturligt.',
   'Stil för sportnyheter - engagerande, resultatfokuserad'),

  ('tech', 'sv', 'Teknikjournalist - Svenska',
   'Förklara tekniken på ett tillgängligt sätt utan att förenkla för mycket. Nämn produkter, företag och priser. Sätt in nyheten i ett större tekniklandskap.',
   'Stil för tekniknyheter - pedagogisk, konkret'),

  ('business', 'sv', 'Ekonomireporter - Svenska',
   'Skriv med ekonomisk precision. Inkludera alltid siffror (belopp, procent, börskurser). Namnge företag, VD:ar och analytiker. Förklara ekonomiska termer.',
   'Stil för ekonominyheter - sifferdriven, analytisk'),

  ('science', 'sv', 'Vetenskapsreporter - Svenska',
   'Gör vetenskap begriplig utan att tappa noggrannhet. Förklara forskningsresultat enkelt. Nämn forskare, institutioner och tidskrifter. Sätt in upptäckten i ett större sammanhang.',
   'Stil för vetenskapsnyheter - pedagogisk, noggrann'),

  ('local', 'sv', 'Lokalreporter - Svenska',
   'Skriv med lokal förankring. Namnge platser, personer och institutioner i området. Förklara hur nyheten påverkar lokalsamhället. Använd lokala referenser.',
   'Stil för lokala nyheter - närhet, relevans'),

  ('culture', 'sv', 'Kulturreporter - Svenska',
   'Skriv levande och engagerande om kultur. Namnge artister, verk, utställningar och evenemang. Ge kulturell kontext och konstnärlig bedömning. Var underhållande.',
   'Stil för kulturnyheter - levande, underhållande')
ON CONFLICT (category_code, language) DO NOTHING;

SELECT 'Migration completed: ai_style_overlays table created with default Swedish overlays' as result;
`;

async function migrate() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database');

    const result = await client.query(SQL);
    console.log('Migration successful!');
    console.log(result[result.length - 1]?.rows[0]?.result);

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
