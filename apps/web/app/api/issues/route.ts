import { authGate } from "@/lib/server/auth";
import { json, readJson, writeError } from "@/lib/server/http";
import { resolveWorkspace } from "@/lib/server/workspace";
import { insertIssue, listIssues, mapIssue, type CreateIssueInput } from "@/lib/server/issues";

const csv = (v: string | null): string[] | undefined =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

/** GET /api/issues — filtered list; board columns fetch everything for a workspace. */
export async function GET(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const resolved = await resolveWorkspace(gate.user, req);
  if (!resolved) return writeError(400, "workspace not found");

  const url = new URL(req.url);
  const parentParam = url.searchParams.get("parent_issue_id");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const { issues, total } = await listIssues({
    workspace_id: resolved.workspace.id,
    q: url.searchParams.get("q") ?? undefined,
    statuses: csv(url.searchParams.get("statuses")),
    status_categories: csv(url.searchParams.get("status_categories")),
    priorities: csv(url.searchParams.get("priorities")),
    assignee_id: url.searchParams.get("assignee_id") ?? undefined,
    creator_id: url.searchParams.get("creator_id") ?? undefined,
    parent_issue_id: parentParam,
    parent_issue_id_set: parentParam !== null,
    limit,
    offset,
  });
  return json({ issues: issues.map(mapIssue), total });
}

/** POST /api/issues — create; workspace from X-Workspace-Slug, number auto-assigned. */
export async function POST(req: Request) {
  const gate = await authGate(req);
  if (gate.response) return gate.response;

  const resolved = await resolveWorkspace(gate.user, req);
  if (!resolved) return writeError(400, "workspace not found");

  const body = await readJson<CreateIssueInput>(req);
  if (!body.title?.trim()) return writeError(400, "title is required");

  const issue = await insertIssue(resolved.workspace.id, gate.user.id, {
    ...body,
    title: body.title.trim(),
  });
  return json({ ...mapIssue(issue), labels: [] }, { status: 201 });
}
