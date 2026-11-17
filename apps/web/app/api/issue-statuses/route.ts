import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, writeError } from "@/lib/server/http";

/** GET /api/issue-statuses?include_archived= — workspace status catalog. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const slug = url.searchParams.get("workspace_slug") ?? req.headers.get("X-Workspace-Slug");
  const includeArchived = url.searchParams.get("include_archived") === "true";
  if (!workspaceId && !slug) return writeError(400, "workspace_id or X-Workspace-Slug is required");

  const sql = db();
  const wsRows = await sql`SELECT w.id FROM workspace w
                            JOIN member m ON m.workspace_id = w.id AND m.user_id = ${gate.user.id}
                            WHERE ${workspaceId ? sql`w.id = ${workspaceId}` : sql`w.slug = ${slug!}`}`;
  const ws = (wsRows as Array<{ id: string }>)[0];
  if (!ws) return writeError(404, "workspace not found");

  const rows = await sql`SELECT * FROM issue_status
                          WHERE workspace_id = ${ws.id}
                            ${includeArchived ? sql`` : sql`AND archived_at IS NULL`}
                          ORDER BY position ASC`;
  const statuses = rows as Array<{
    id: string; workspace_id: string; key: string; name: string; description: string;
    category: string; color: string; is_system: boolean; position: number;
    archived_at: Date | null; created_at: Date; updated_at: Date;
  }>;
  const categories = [...new Set(statuses.map((s) => s.category))];

  return json({
    statuses: statuses.map((s) => ({
      id: s.id,
      workspace_id: s.workspace_id,
      key: s.key,
      name: s.name,
      description: s.description,
      category: s.category,
      color: s.color,
      icon: null,
      is_system: s.is_system,
      position: s.position,
      archived_at: s.archived_at ? s.archived_at.toISOString() : null,
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    })),
    categories,
    total: statuses.length,
  });
}
