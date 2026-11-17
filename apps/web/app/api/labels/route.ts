import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/labels — Phase 1: no labels. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ labels: [], total: 0 });
}
