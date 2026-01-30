const { migrate } = require("drizzle-orm/node-postgres/migrator");
const { db, pool } = require("./db");

async function main() {
  console.log("Running migrations...");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    // Don't close pool if we are just running this as a script before server? 
    // Actually, if we use '&&', this process exits. So we MUST close pool.
    await pool.end();
  }
}

main();
