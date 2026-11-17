import { db } from "./db";
import type { SessionUser } from "./auth";

// Workspace resolution: mutations identify the workspace via the
// X-Workspace-Slug header (set by the frontend client), GETs may also pass
// ?workspace_id=. Membership is always enforced.

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  issue_prefix: string;
  issue_counter: number;
  created_at: Date;
  updated_at: Date;
}

export interface ResolvedWorkspace {
  workspace: WorkspaceRow;
  role: string;
}

function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "ws";
}

export async function uniqueSlug(baseName: string): Promise<string> {
  const sql = db();
  const base = slugFromName(baseName);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await sql`SELECT 1 FROM workspace WHERE slug = ${slug}`;
    if ((rows as unknown[]).length === 0) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const BUILTIN_STATUSES: Array<{ key: string; name: string; color: string; position: number }> = [
  { key: "backlog", name: "Backlog", color: "#6b7280", position: 0 },
  { key: "todo", name: "Todo", color: "#9ca3af", position: 1024 },
  { key: "in_progress", name: "In Progress", color: "#f59e0b", position: 2048 },
  { key: "in_review", name: "In Review", color: "#3b82f6", position: 3072 },
  { key: "done", name: "Done", color: "#10b981", position: 4096 },
  { key: "blocked", name: "Blocked", color: "#ef4444", position: 5120 },
  { key: "cancelled", name: "Cancelled", color: "#4b5563", position: 6144 },
];

export async function createWorkspaceForUser(
  user: SessionUser,
  input: { name: string; slug?: string; description?: string; issue_prefix?: string }
): Promise<WorkspaceRow> {
  const sql = db();
  const slug = input.slug?.trim() ? slugFromName(input.slug) : await uniqueSlug(input.name);
  const prefix =
    input.issue_prefix?.trim() ||
    (input.name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "WS");

  const wsRows = await sql`INSERT INTO workspace (name, slug, description, issue_prefix)
      VALUES (${input.name}, ${slug}, ${input.description ?? null}, ${prefix})
      RETURNING *`;
  const workspace = (wsRows as WorkspaceRow[])[0];
  if (!workspace) throw new Error("workspace insert returned no row");

  await sql`INSERT INTO member (workspace_id, user_id, role) VALUES (${workspace.id}, ${user.id}, 'owner')`;
  for (const s of BUILTIN_STATUSES) {
    await sql`INSERT INTO issue_status (workspace_id, key, name, category, color, is_system, position)
              VALUES (${workspace.id}, ${s.key}, ${s.name}, ${s.key}, ${s.color}, TRUE, ${s.position})`;
  }
  return workspace;
}

export async function resolveWorkspace(
  user: SessionUser,
  req: Request
): Promise<ResolvedWorkspace | null> {
  const sql = db();
  const slug = req.headers.get("X-Workspace-Slug");
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");

  let rows: unknown[];
  if (slug) {
    rows = await sql`SELECT w.*, m.role FROM workspace w
                      JOIN member m ON m.workspace_id = w.id AND m.user_id = ${user.id}
                      WHERE w.slug = ${slug}`;
  } else if (workspaceId) {
    rows = await sql`SELECT w.*, m.role FROM workspace w
                      JOIN member m ON m.workspace_id = w.id AND m.user_id = ${user.id}
                      WHERE w.id = ${workspaceId}`;
  } else {
    return null;
  }
  const row = (rows as Array<WorkspaceRow & { role: string }>)[0];
  return row ? { workspace: row, role: row.role } : null;
}
