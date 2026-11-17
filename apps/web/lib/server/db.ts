import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Singleton Neon HTTP client. Works identically under `next dev` (Node) and on
// Cloudflare Workers (OpenNext + nodejs_compat) — the driver is fetch-based,
// so no TCP pool is needed in either runtime.
let client: NeonQueryFunction<false, false> | null = null;

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}
