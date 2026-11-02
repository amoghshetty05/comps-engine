import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { COOKIE, cookieOptions, signSession } from "@/lib/auth";

export async function POST(req) {
  const { email = "", password = "" } = await req.json().catch(() => ({}));
  const [user] = await query(
    "SELECT user_id, email, full_name, role, password_hash FROM users WHERE email = $1",
    [String(email).trim().toLowerCase()]
  );
  // Same message for "no such user" and "wrong password", so the form cannot
  // be used to discover which emails have accounts.
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    return Response.json({ error: "Wrong email or password" }, { status: 401 });
  }
  cookies().set(COOKIE, await signSession(user), cookieOptions);
  return Response.json({ user: { email: user.email, full_name: user.full_name, role: user.role } });
}
