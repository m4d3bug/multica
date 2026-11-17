import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, readJson, writeError } from "@/lib/server/http";
import { getIssueById, mapIssue, positionBetween } from "@/lib/server/issues";

/**
 * POST /api/issues/{id}/move — board drag & drop: change column (status) and
 * compute the fractional position between neighbor cards. before_id is the
 * card above (smaller position), after_id the card below (larger position).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const issue = await getIssueById(id);
  if (!issue) return writeError(404, "issue not found");

  const sql = db();
  const memberRows = await sql`SELECT 1 FROM member
                                WHERE workspace_id = ${issue.workspace_id} AND user_id = ${gate.user.id}`;
  if ((memberRows as unknown[]).length === 0) return writeError(404, "issue not found");

  const body = await readJson<{
    status?: string;
    assignee_type?: string | null;
    assignee_id?: string | null;
    parent_issue_id?: string | null;
    before_id?: string | null;
    after_id?: string | null;
  }>(req);

  const position = await positionBetween(issue.workspace_id, body.before_id ?? null, body.after_id ?? null);

  await sql`UPDATE issue
            SET position = ${position},
                status = COALESCE(${body.status?.trim() || null}, status),
                assignee_type = ${body.assignee_type ?? issue.assignee_type},
                assignee_id = ${body.assignee_id ?? issue.assignee_id},
                parent_issue_id = ${body.parent_issue_id ?? issue.parent_issue_id},
                revision = revision + 1,
                updated_at = now()
            WHERE id = ${id}`;

  return json(mapIssue((await getIssueById(id))!));
}
