require("dotenv").config();
const { db } = require("./db");
const { adminUsers, rssSources } = require("./db/schema");
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

  console.log("--- Seeding Completed ---");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
