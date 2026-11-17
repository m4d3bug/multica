import { randomInt } from "node:crypto";
import { db } from "@/lib/server/db";
import { json, readJson, writeError } from "@/lib/server/http";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes, matches Go handler

/**
 * POST /auth/send-code — email verification code login (also the signup
 * entry point when MULTICA_ALLOW_SIGNUP is true). Self-host without an email
 * provider: codes are logged server-side; set MULTICA_DEV_VERIFICATION_CODE
 * for a fixed code that verify-code always accepts (same as the Go server).
 */
export async function POST(req: Request) {
  const body = await readJson<{ email?: string }>(req);
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return writeError(400, "invalid email");
  }

  const sql = db();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`INSERT INTO verification_code (email, code, expires_at)
            VALUES (${email}, ${code}, ${new Date(Date.now() + CODE_TTL_MS)})`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[auth] verification code for ${email}: ${code}`);
  }

  return json({ ok: true });
}
