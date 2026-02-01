/**
 * Script för att sätta lösenord för en admin-användare
 * Kör: node scripts/set-password.js
 *
 * Miljövariabler som behövs:
 * - DATABASE_URL
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const EMAIL = 'thomas@recompute.it';
const PASSWORD = 'qwerty123456';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Ansluter till databasen...');

    // Hash lösenordet
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    // Kolla om användaren finns
    const checkResult = await pool.query(
      'SELECT id, email FROM admin_users WHERE email = $1',
      [EMAIL]
    );

    if (checkResult.rows.length > 0) {
      // Uppdatera befintlig användare
      await pool.query(
        `UPDATE admin_users
         SET password_hash = $1, force_password_change = false, updated_at = NOW()
         WHERE email = $2`,
        [passwordHash, EMAIL]
      );
      console.log(`✅ Lösenord uppdaterat för: ${EMAIL}`);
    } else {
      // Skapa ny användare
      await pool.query(
        `INSERT INTO admin_users (email, password_hash, force_password_change, is_super_admin, totp_enabled)
         VALUES ($1, $2, false, true, false)`,
        [EMAIL, passwordHash]
      );
      console.log(`✅ Ny användare skapad: ${EMAIL}`);
    }

    console.log(`Lösenord: ${PASSWORD}`);
    console.log('\n⚠️  Kom ihåg att byta till ett säkert lösenord!');

  } catch (err) {
    console.error('Fel:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
