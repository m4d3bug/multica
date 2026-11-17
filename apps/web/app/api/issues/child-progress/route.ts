import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/issues/child-progress — Phase 1: no sub-issues. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ progress: [] });
}
