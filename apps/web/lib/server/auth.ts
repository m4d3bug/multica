import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { csrfFailure, isMutating } from "./http";

// Cookie names match the Go server (server/internal/auth/cookie.go) so the
// existing frontend wiring (credentials: "include", X-CSRF-Token echo of the
// multica_csrf cookie) works unchanged.
export const AUTH_COOKIE = "multica_auth";
export const CSRF_COOKIE = "multica_csrf";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same as Go AuthTokenTTL default

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  onboarded_at: string | null;
  onboarding_questionnaire: Record<string, unknown>;
  language: string | null;
  profile_description: string;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  onboarded_at: Date | null;
  onboarding_questionnaire: Record<string, unknown> | null;
  language: string | null;
  profile_description: string | null;
  timezone: string | null;
  created_at: Date;
  updated_at: Date;
};

export function mapUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar_url: row.avatar_url,
    onboarded_at: row.onboarded_at ? row.onboarded_at.toISOString() : null,
    onboarding_questionnaire: row.onboarding_questionnaire ?? {},
    language: row.language,
    profile_description: row.profile_description ?? "",
    timezone: row.timezone,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ token: string; csrfToken: string }> {
  const sql = db();
  const token = newToken();
  const csrfToken = randomBytes(16).toString("hex");
  await sql`INSERT INTO session (id, user_id, csrf_token, expires_at)
            VALUES (${token}, ${userId}, ${csrfToken}, ${new Date(Date.now() + SESSION_TTL_MS)})`;
  return { token, csrfToken };
}

export async function destroySession(token: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM session WHERE id = ${token}`;
}

async function sessionFromToken(token: string): Promise<{ userId: string; csrfToken: string } | null> {
  const sql = db();
  const rows = await sql`SELECT user_id, csrf_token FROM session
                          WHERE id = ${token} AND expires_at > now()`;
  const row = (rows as Array<{ user_id: string; csrf_token: string }>)[0];
  return row ? { userId: row.user_id, csrfToken: row.csrf_token } : null;
}

/** Resolve the current user from the auth cookie; null when unauthenticated. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const session = await sessionFromToken(token);
  if (!session) return null;
  const sql = db();
  const rows = await sql`SELECT * FROM "user" WHERE id = ${session.userId}`;
  const row = (rows as UserRow[])[0];
  return row ? mapUser(row) : null;
}

/** Auth gate result: either an authenticated user, or a ready-to-send response. */
export type AuthGate = { user: SessionUser; response?: never } | { user?: never; response: Response };

/**
 * Auth + CSRF gate. Mutating requests use the double-submit cookie pattern:
 * the frontend echoes the readable multica_csrf cookie in X-CSRF-Token
 * (packages/core/api/client.ts buildHeaders). 401 = no session, 403 = CSRF
 * mismatch (the client auto-retries once on that status + message).
 */
export async function authGate(req: Request): Promise<AuthGate> {
  const user = await currentUser();
  if (!user) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (isMutating(req.method)) {
    const jar = await cookies();
    const header = req.headers.get("X-CSRF-Token");
    const cookieToken = jar.get(CSRF_COOKIE)?.value;
    if (!cookieToken || !header || header !== cookieToken) {
      return { response: csrfFailure() };
    }
  }
  return { user };
}

export async function setAuthCookies(token: string, csrfToken: string): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const maxAge = SESSION_TTL_MS / 1000;
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  jar.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [AUTH_COOKIE, CSRF_COOKIE]) {
    jar.set(name, "", { path: "/", maxAge: 0 });
  }
}
