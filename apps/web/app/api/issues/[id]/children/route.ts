import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/issues/{id}/children — Phase 1: no sub-issues. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  await ctx.params;
  return json({ issues: [] });
}
