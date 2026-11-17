import { NextResponse } from "next/server";

// Shared helpers for the API route handlers.

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export function writeError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Body text the frontend ApiClient matches on for its CSRF auto-retry
// (packages/core/api/client.ts treats 403 + this message as retryable once).
export const CSRF_ERROR = "CSRF validation failed";

export function csrfFailure(): NextResponse {
  return writeError(403, CSRF_ERROR);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function isMutating(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
