import { NextResponse } from "next/server";
import { COOKIE, verifySession } from "./lib/auth";

const PUBLIC = ["/login", "/register", "/api/auth/login", "/api/auth/register"];

/** Runs before every page and API request: no valid session means no access,
 *  and anything under /admin or /api/admin needs the admin role. */
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const session = await verifySession(req.cookies.get(COOKIE)?.value);

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const adminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (adminArea && session.role !== "admin") {
    if (isApi) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.redirect(new URL("/?denied=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
