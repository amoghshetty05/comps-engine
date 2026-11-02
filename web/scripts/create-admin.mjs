// Create or promote an admin user from the command line.
// Usage (from the web/ folder):
//   npm run create-admin -- admin@example.com "a-strong-password" "Your Name"
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const [email, password, fullName = "Administrator"] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run create-admin -- <email> <password (8+ chars)> ["Full Name"]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const hash = await bcrypt.hash(password, 12);
const { rows } = await client.query(
  `INSERT INTO users (email, password_hash, full_name, role)
   VALUES (lower($1), $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, role = 'admin', full_name = EXCLUDED.full_name
   RETURNING user_id, email, role`,
  [email, hash, fullName]
);
console.log(`Admin ready: ${rows[0].email} (user_id ${rows[0].user_id})`);
await client.end();
