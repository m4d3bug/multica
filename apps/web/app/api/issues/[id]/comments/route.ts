import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, readJson, writeError } from "@/lib/server/http";
import { getIssueById } from "@/lib/server/issues";

type CommentRow = {
  id: string;
  issue_id: string;
  author_type: string;
  author_id: string;
  content: string;
  type: string;
  parent_id: string | null;
  reactions: unknown[];
  created_at: Date;
  updated_at: Date;
  revision: number;
};

function mapComment(c: CommentRow) {
  return {
    id: c.id,
    issue_id: c.issue_id,
    author_type: c.author_type,
    author_id: c.author_id,
    content: c.content,
    type: c.type,
    parent_id: c.parent_id,
    reactions: c.reactions ?? [],
    attachments: [],
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
    revision: c.revision,
  };
}

async function requireIssueAccess(userId: string, issueId: string) {
  const issue = await getIssueById(issueId);
  if (!issue) return null;
  const sql = db();
  const rows = await sql`SELECT 1 FROM member
                          WHERE workspace_id = ${issue.workspace_id} AND user_id = ${userId}`;
  return (rows as unknown[]).length > 0 ? issue : null;
}

/** GET /api/issues/{id}/comments — Comment[] (top-level array). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  if (!(await requireIssueAccess(gate.user.id, id))) return writeError(404, "issue not found");

  const sql = db();
  const rows = await sql`SELECT * FROM comment
                          WHERE issue_id = ${id} AND deleted_at IS NULL
                          ORDER BY created_at ASC`;
  return json((rows as CommentRow[]).map(mapComment));
}

/** POST /api/issues/{id}/comments — add a comment. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  if (!(await requireIssueAccess(gate.user.id, id))) return writeError(404, "issue not found");

  const body = await readJson<{ content?: string; type?: string; parent_id?: string }>(req);
  if (!body.content?.trim()) return writeError(400, "content is required");

  const sql = db();
  const rows = await sql`INSERT INTO comment (issue_id, author_type, author_id, content, type, parent_id)
                          VALUES (${id}, 'member', ${gate.user.id}, ${body.content.trim()},
                                  ${body.type ?? "comment"}, ${body.parent_id ?? null})
                          RETURNING *`;
  const inserted = (rows as CommentRow[])[0];
  if (!inserted) throw new Error("comment insert returned no row");
  return json(mapComment(inserted), { status: 201 });
}
