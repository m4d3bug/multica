import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/working-agents — Phase 1: no agent runtimes. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json([]);
}
