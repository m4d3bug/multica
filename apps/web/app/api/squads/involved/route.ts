import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/squads/involved — Phase 1: no squads. Client throws on a bare
 * array, so the wrapper object with squad_ids is mandatory. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ squad_ids: [] });
}
