import { cookies } from "next/headers";
import { COOKIE } from "@/lib/auth";

export async function POST() {
  cookies().delete(COOKIE);
  return Response.json({ ok: true });
}
