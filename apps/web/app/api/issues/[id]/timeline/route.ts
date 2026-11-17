import { db } from "@/lib/server/db";
import { authGate } from "@/lib/server/auth";
import { json, writeError } from "@/lib/server/http";
import { getIssueById } from "@/lib/server/issues";

type CommentRow = {
  id: string;
  author_type: string;
  author_id: string;
  content: string;
  type: string;
  parent_id: string | null;
  created_at: Date;
  revision: number;
};

/**
 * GET /api/issues/{id}/timeline — top-level array. Phase 1 renders comments
 * only; richer activity entries arrive with later phases.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const issue = await getIssueById(id);
  if (!issue) return writeError(404, "issue not found");

  const sql = db();
  const memberRows = await sql`SELECT 1 FROM member
                                WHERE workspace_id = ${issue.workspace_id} AND user_id = ${gate.user.id}`;
  if ((memberRows as unknown[]).length === 0) return writeError(404, "issue not found");

  const rows = await sql`SELECT id, author_type, author_id, content, type, parent_id, created_at, revision
                          FROM comment
                          WHERE issue_id = ${id} AND deleted_at IS NULL
                          ORDER BY created_at ASC`;
  return json(
    (rows as CommentRow[]).map((c) => ({
      type: "comment",
      id: c.id,
      actor_type: c.author_type,
      actor_id: c.author_id,
      created_at: c.created_at.toISOString(),
      content: c.content,
      comment_type: c.type,
      parent_id: c.parent_id,
      reactions: [],
      attachments: [],
      revision: c.revision,
    }))
  );
}
