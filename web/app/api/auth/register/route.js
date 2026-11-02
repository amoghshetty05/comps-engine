import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().trim().min(2).max(120),
});

// Self-registration always creates an analyst. Admins are created only
// from the command line (npm run create-admin), never through the web.
export async function POST(req) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { email, password, full_name } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  try {
    const [user] = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'analyst') RETURNING user_id, email, full_name, role`,
      [email, hash, full_name]
    );
    return Response.json({ user }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return Response.json({ error: "An account with that email already exists" }, { status: 409 });
    }
    throw err;
  }
}
