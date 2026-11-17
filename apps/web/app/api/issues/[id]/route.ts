import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, readJson, writeError } from "@/lib/server/http";
import { getIssueById, mapIssue } from "@/lib/server/issues";

async function memberCanAccess(userId: string, workspaceId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql`SELECT 1 FROM member WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`;
  return (rows as unknown[]).length > 0;
}

/** GET /api/issues/{id} — single issue. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const issue = await getIssueById(id);
  if (!issue || !(await memberCanAccess(gate.user.id, issue.workspace_id))) {
    return writeError(404, "issue not found");
  }
  return json(mapIssue(issue));
}

const NULLABLE_ASSIGNEE = new Set(["member", "agent", "squad"]);
const PRIORITIES = new Set(["urgent", "high", "medium", "low", "none"]);

/** PUT /api/issues/{id} — partial update with optional optimistic locking. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const issue = await getIssueById(id);
  if (!issue || !(await memberCanAccess(gate.user.id, issue.workspace_id))) {
    return writeError(404, "issue not found");
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (body.expected_revision != null && body.expected_revision !== issue.revision) {
    return writeError(409, "revision mismatch");
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown, cast?: string) => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast ?? ""}`);
  };

  if ("title" in body && typeof body.title === "string" && body.title.trim()) push("title", body.title.trim());
  if ("description" in body) push("description", body.description ?? null);
  if ("status" in body && typeof body.status === "string" && body.status.trim()) push("status", body.status);
  if ("priority" in body && typeof body.priority === "string" && PRIORITIES.has(body.priority)) push("priority", body.priority);
  if ("assignee_type" in body) {
    const t = body.assignee_type;
    push("assignee_type", t && NULLABLE_ASSIGNEE.has(t as string) ? t : null);
  }
  if ("assignee_id" in body) push("assignee_id", body.assignee_id ?? null);
  if ("parent_issue_id" in body) push("parent_issue_id", body.parent_issue_id ?? null);
  if ("position" in body && typeof body.position === "number") push("position", body.position);
  if ("stage" in body) push("stage", body.stage ?? null);
  if ("start_date" in body) push("start_date", body.start_date ? new Date(body.start_date as string) : null);
  if ("due_date" in body) push("due_date", body.due_date ? new Date(body.due_date as string) : null);
  if ("properties" in body && body.properties && typeof body.properties === "object") {
    push("properties", JSON.stringify(body.properties), "::jsonb");
  }

  if (sets.length) {
    sets.push(`revision = revision + 1`, `updated_at = now()`);
    params.push(id);
    const idIdx = params.length;
    const sql = db();
    await sql.query(`UPDATE issue SET ${sets.join(", ")} WHERE id = $${idIdx}`, params);
  }

  return json(mapIssue((await getIssueById(id))!));
}
