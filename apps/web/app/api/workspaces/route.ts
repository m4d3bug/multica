import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, readJson, writeError } from "@/lib/server/http";
import { createWorkspaceForUser, type WorkspaceRow } from "@/lib/server/workspace";

function mapWorkspace(w: WorkspaceRow, pinnedAt: Date | null = null) {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    description: w.description,
    issue_prefix: w.issue_prefix,
    created_at: w.created_at.toISOString(),
    updated_at: w.updated_at.toISOString(),
    pinned_at: pinnedAt ? pinnedAt.toISOString() : null,
  };
}

/** GET /api/workspaces — workspaces the user belongs to (WorkspaceListItem[]). */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const sql = db();
  const rows = await sql`SELECT w.* FROM workspace w
                          JOIN member m ON m.workspace_id = w.id AND m.user_id = ${gate.user.id}
                          ORDER BY w.created_at ASC`;
  return json((rows as WorkspaceRow[]).map((w) => mapWorkspace(w)));
}

/** POST /api/workspaces — create workspace (owner member + 7 system statuses seeded). */
export async function POST(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const body = await readJson<{ name?: string; slug?: string; description?: string; issue_prefix?: string }>(req);
  const name = body.name?.trim();
  if (!name) return writeError(400, "name is required");

  const workspace = await createWorkspaceForUser(gate.user, {
    name,
    slug: body.slug,
    description: body.description,
    issue_prefix: body.issue_prefix,
  });
  return json(mapWorkspace(workspace), { status: 201 });
}
