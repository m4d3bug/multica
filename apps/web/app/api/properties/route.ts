import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/properties — Phase 1: no custom properties. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ properties: [], total: 0 });
}
