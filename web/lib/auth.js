import { SignJWT, jwtVerify } from "jose";

// Kept free of Node-only imports so middleware.js (edge runtime) can use it.
export const COOKIE = "comps_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

/** Signed token holding who the user is and their role. It is stored in an
 *  httpOnly cookie, so page JavaScript can never read or steal it. */
export async function signSession(user) {
  return new SignJWT({ role: user.role, name: user.full_name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.user_id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), role: payload.role, name: payload.name, email: payload.email };
  } catch {
    return null; // expired, tampered with, or signed with another secret
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
  path: "/",
  maxAge: MAX_AGE,
};
