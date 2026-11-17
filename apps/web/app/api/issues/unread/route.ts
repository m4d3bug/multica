import { authGate } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/issues/unread — Phase 1: everything read; next_cursor: null ends
 * the client's pagination loop. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;
  return json({ items: [], next_cursor: null });
}
