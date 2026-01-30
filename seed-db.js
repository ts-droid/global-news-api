require("dotenv").config();
const { db } = require("./db");
const { adminUsers, rssSources, aiPrompts } = require("./db/schema");
const { hashPassword } = require("./adminAuth");
const { newsSources } = require("./sources");
const { eq } = require("drizzle-orm");

async function seed() {
  console.log("--- Seeding Database ---");

  // 1. Seed Super Admin
  const adminEmail = "thomas@recompute.it";
  const existingAdmin = await db.select().from(adminUsers).where(eq(adminUsers.email, adminEmail)).limit(1);

  if (existingAdmin.length === 0) {
    console.log(`Creating super-admin: ${adminEmail}`);
    const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD || "admin123");
    await db.insert(adminUsers).values({
      email: adminEmail,
      passwordHash,
      isSuperAdmin: true,
      forcePasswordChange: true,
    });
    console.log("✓ Super-admin created (forced password change enabled)");
  } else {
    console.log("Super-admin already exists, skipping...");
  }

  // 2. Seed RSS Sources from sources.js
  console.log("Seeding RSS sources...");
  for (const source of newsSources) {
    const existingSource = await db.select().from(rssSources).where(eq(rssSources.code, source.code)).limit(1);
    if (existingSource.length === 0) {
      await db.insert(rssSources).values({
        ...source,
        updatedAt: new Date()
      });
    }
  }
  console.log(`✓ Seeded ${newsSources.length} sources`);

  // 3. Seed AI Prompts
  console.log("Seeding AI prompts...");
  const defaultPrompts = [
    { 
      category: 'base', 
      prompt: `Du är en professionell nyhetsjournalist som skriver på svenska. Din uppgift är att:
1. Översätta nyhetsartiklar till flytande, naturlig svenska
2. Sammanfatta innehållet i 2-3 koncisa stycken (100-150 ord totalt)
3. Behålla en objektiv, journalistisk ton
4. Extrahera ALLA specifika detaljer: namn, platser, siffror, datum
5. Om innehållet är begränsat/betalvägg: skriv en kort notis baserad på rubriken

VIKTIGT: 
- Skriv ALDRIG vaga fraser som "en spelare", "två nationer", "flera länder" om du har namnen
- Inkludera ALLTID specifika namn och siffror som finns i texten
- Om artikeln saknar detaljer, skriv kortfattat vad som är känt

Svara ALLTID i följande JSON-format (inget annat):
{
  "title": "Översatt rubrik på svenska",
  "summary": "Sammanfattning på svenska i 2-3 stycken"
}` 
    },
    { category: 'world', prompt: 'VIKTIGT för världsnyheter: Namnge länderna, städerna och nyckelpersonerna. Fokusera på den globala påverkan.' },
    { category: 'politics', prompt: 'VIKTIGT för politiska nyheter: Namnge politiker, partier och specifika beslut. Behåll strikt objektivitet.' },
    { category: 'sports', prompt: 'VIKTIGT för sportnyheter: Inkludera exakta resultat, poäng och namn på lag/spelare.' },
    { category: 'tech', prompt: 'VIKTIGT för tekniknyheter: Förklara tekniken enkelt, nämn specifika produkter, specifikationer och företag.' },
    { category: 'business', prompt: 'VIKTIGT för ekonominyheter: Inkludera siffror (valuta, procent) och företagsnamn. Fokusera på marknadsreaktioner.' },
    { category: 'science', prompt: 'VIKTIGT för vetenskapsnyheter: Förklara upptäckten enkelt men korrekt, nämn forskare och institutioner.' },
    { category: 'climate', prompt: 'VIKTIGT för klimatnyheter: Ange siffror för temperatur/utsläpp, nämn specifika avtal eller rapporter.' },
    { category: 'culture', prompt: 'VIKTIGT för kulturnyheter: Namnge artister, verk, evenemang och platser.' },
    { category: 'default', prompt: 'Inkludera specifika namn, platser och datum. Var konkret och informativ.' },
  ];

  for (const p of defaultPrompts) {
    const [existing] = await db.select().from(aiPrompts).where(eq(aiPrompts.category, p.category)).limit(1);
    if (!existing) {
      await db.insert(aiPrompts).values({
        ...p,
        updatedAt: new Date()
      });
    }
  }
  console.log("✓ AI prompts seeded");

  console.log("--- Seeding Completed ---");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
