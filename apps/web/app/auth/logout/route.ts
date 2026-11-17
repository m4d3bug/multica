import { cookies } from "next/headers";
import { db } from "@/lib/server/db";
import { json } from "@/lib/server/http";
import { AUTH_COOKIE, clearAuthCookies } from "@/lib/server/auth";

/** POST /auth/logout — drop the server session and clear auth cookies. */
export async function POST() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) {
    const sql = db();
    await sql`DELETE FROM session WHERE id = ${token}`;
  }
  await clearAuthCookies();
  return json({ ok: true });
}
