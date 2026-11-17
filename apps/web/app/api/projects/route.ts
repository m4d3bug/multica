import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/projects — Phase 1: no projects. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ projects: [], total: 0 });
}
