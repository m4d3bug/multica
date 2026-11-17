import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, writeError } from "@/lib/server/http";

/** GET /api/workspaces/{id}/members — MemberWithUser[] (assignee pickers). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const sql = db();
  const rows = await sql`SELECT m.id, m.workspace_id, m.user_id, m.role, m.created_at,
                                 u.name, u.email, u.avatar_url
                          FROM member m
                          JOIN "user" u ON u.id = m.user_id
                          WHERE m.workspace_id = ${id}
                            AND EXISTS (SELECT 1 FROM member me
                                        WHERE me.workspace_id = ${id} AND me.user_id = ${gate.user.id})
                          ORDER BY m.created_at ASC`;
  const members = (rows as Array<{
    id: string; workspace_id: string; user_id: string; role: string;
    created_at: Date; name: string; email: string; avatar_url: string | null;
  }>).map((m) => ({
    id: m.id,
    workspace_id: m.workspace_id,
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at.toISOString(),
    name: m.name,
    email: m.email,
    avatar_url: m.avatar_url,
  }));
  if (!members.length) {
    // Not a member (or workspace missing) — indistinguishable on purpose.
    return writeError(404, "workspace not found");
  }
  return json(members);
}
