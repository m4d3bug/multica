import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/agents — Phase 1: agent registry arrives with the daemon phase. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json([]);
}
