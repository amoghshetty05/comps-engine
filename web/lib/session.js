import { cookies } from "next/headers";
import { COOKIE, verifySession } from "./auth";

/** Current user for server components and route handlers (null if logged out). */
export async function getSession() {
  return verifySession(cookies().get(COOKIE)?.value);
}

/** Route-handler guard. Middleware already blocks these requests; checking
 *  again here means a routing mistake can never expose an admin action. */
export async function requireRole(role) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Not logged in" }, { status: 401 }) };
  if (role && session.role !== role) {
    return { error: Response.json({ error: "Admins only" }, { status: 403 }) };
  }
  return { session };
}
