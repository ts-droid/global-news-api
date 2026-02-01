/**
 * Seed Reference Data Script
 * Populates categories, subcategories, continents, and countries
 *
 * Run: node scripts/seed-reference-data.js
 */

require('dotenv').config();
const { db } = require('../db');
const {
  categories,
  subcategories,
  continents,
  countries
} = require('../db/schema');
const { CATEGORIES } = require('../constants/categories');
const { CONTINENTS, COUNTRIES } = require('../constants/geography');
const { eq } = require('drizzle-orm');

async function seedCategories() {
  console.log('Seeding categories...');

  for (const [code, cat] of Object.entries(CATEGORIES)) {
    // Check if category exists
    const existing = await db.select()
      .from(categories)
      .where(eq(categories.code, code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(categories).values({
        code: cat.code,
        nameSv: cat.nameSv,
        nameEn: cat.nameEn,
        descriptionSv: cat.descriptionSv,
        descriptionEn: cat.descriptionEn,
        icon: cat.icon,
        color: cat.color,
        sortOrder: cat.sortOrder,
        isActive: true
      });
      console.log(`  + Added category: ${cat.nameSv}`);
    } else {
      console.log(`  = Category exists: ${cat.nameSv}`);
    }

    // Seed subcategories
    for (let i = 0; i < cat.subcategories.length; i++) {
      const sub = cat.subcategories[i];
      const existingSub = await db.select()
        .from(subcategories)
        .where(eq(subcategories.code, sub.code))
        .limit(1);

      if (existingSub.length === 0) {
        await db.insert(subcategories).values({
          categoryCode: cat.code,
          code: sub.code,
          nameSv: sub.nameSv,
          nameEn: sub.nameEn,
          sortOrder: i,
          isActive: true
        });
        console.log(`    + Added subcategory: ${sub.nameSv}`);
      }
    }
  }

  console.log('Categories seeded successfully!\n');
}

async function seedContinents() {
  console.log('Seeding continents...');

  for (const cont of CONTINENTS) {
    const existing = await db.select()
      .from(continents)
      .where(eq(continents.code, cont.code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(continents).values({
        code: cont.code,
        nameSv: cont.nameSv,
        nameEn: cont.nameEn,
        sortOrder: cont.sortOrder
      });
      console.log(`  + Added continent: ${cont.nameSv}`);
    } else {
      console.log(`  = Continent exists: ${cont.nameSv}`);
    }
  }

  console.log('Continents seeded successfully!\n');
}

async function seedCountries() {
  console.log('Seeding countries...');

  let added = 0;
  let skipped = 0;

  for (const country of COUNTRIES) {
    const existing = await db.select()
      .from(countries)
      .where(eq(countries.isoCode, country.iso))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(countries).values({
        isoCode: country.iso,
        continentCode: country.continent,
        nameSv: country.nameSv,
        nameEn: country.nameEn,
        flagEmoji: country.flag,
        isActive: true
      });
      added++;
    } else {
      skipped++;
    }
  }

  console.log(`  + Added ${added} countries`);
  console.log(`  = Skipped ${skipped} existing countries`);
  console.log('Countries seeded successfully!\n');
}

async function main() {
  console.log('='.repeat(50));
  console.log('Seeding Reference Data');
  console.log('='.repeat(50));
  console.log();

  try {
    await seedCategories();
    await seedContinents();
    await seedCountries();

    console.log('='.repeat(50));
    console.log('All reference data seeded successfully!');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
