import { db } from "@/lib/server/db";
import { json, readJson, writeError } from "@/lib/server/http";
import { createSession, mapUser, setAuthCookies, type SessionUser } from "@/lib/server/auth";

const CODE_WINDOW_MS = 10 * 60 * 1000;

type UserRow = Parameters<typeof mapUser>[0];

/** POST /auth/verify-code — validate the code, find-or-create the user, open a session. */
export async function POST(req: Request) {
  const body = await readJson<{ email?: string; code?: string }>(req);
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();
  if (!email || !code) return writeError(400, "email and code are required");

  const sql = db();
  const devCode = process.env.MULTICA_DEV_VERIFICATION_CODE;
  let valid = Boolean(devCode && code === devCode);

  if (!valid) {
    const rows = await sql`SELECT id, code FROM verification_code
                            WHERE email = ${email} AND used = FALSE AND expires_at > now()
                            ORDER BY created_at DESC LIMIT 1`;
    const row = (rows as Array<{ id: string; code: string }>)[0];
    if (row && row.code === code) {
      valid = true;
      await sql`UPDATE verification_code SET used = TRUE WHERE id = ${row.id}`;
    }
  }
  if (!valid) return writeError(400, "invalid or expired code");

  // Signup gate: creating a user requires allow_signup (GET /api/config flag).
  const allowSignup = process.env.MULTICA_ALLOW_SIGNUP !== "false";
  const existing = await sql`SELECT * FROM "user" WHERE email = ${email}`;
  let userRow = (existing as UserRow[])[0];
  if (!userRow) {
    if (!allowSignup) return writeError(403, "signup is disabled");
    const name = (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").trim() || email;
    const created = await sql`INSERT INTO "user" (email, name, onboarded_at)
                               VALUES (${email}, ${name}, now())
                               RETURNING *`;
    userRow = (created as UserRow[])[0];
    if (!userRow) throw new Error("user insert returned no row");
  }
  const user: SessionUser = mapUser(userRow);

  const { token, csrfToken } = await createSession(user.id);
  await setAuthCookies(token, csrfToken);

  // LoginResponse shape (client.ts LoginResponse): token + user. In cookie
  // mode the frontend discards the token; it is kept for CLI/desktop compat.
  return json({ token, user });
}
