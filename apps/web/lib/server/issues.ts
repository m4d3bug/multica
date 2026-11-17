import { db } from "./db";

// Issue row → frontend IssueSchema shape (packages/core/api/schemas.ts:1690).
// `identifier` is workspace issue_prefix + '-' + number; status stays the
// catalog key; status_name/category come from the issue_status catalog.

export interface IssueRow {
  id: string;
  workspace_id: string;
  number: number;
  issue_prefix?: string;
  title: string;
  description: string | null;
  status: string;
  status_name: string | null;
  status_category: string | null;
  priority: string;
  assignee_type: string | null;
  assignee_id: string | null;
  creator_type: string;
  creator_id: string;
  parent_issue_id: string | null;
  metadata: Record<string, unknown> | null;
  properties: Record<string, unknown> | null;
  stage: number | null;
  start_date: Date | null;
  due_date: Date | null;
  position: number;
  revision: number;
  created_at: Date;
  updated_at: Date;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function mapIssue(row: IssueRow): Record<string, unknown> {
  const prefix = row.issue_prefix ?? "";
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    number: row.number,
    identifier: `${prefix}-${row.number}`,
    title: row.title,
    description: row.description,
    status: row.status,
    ...(row.status_category ? { status_category: row.status_category } : {}),
    ...(row.status_name ? { status_name: row.status_name } : {}),
    priority: row.priority,
    assignee_type: row.assignee_type,
    assignee_id: row.assignee_id,
    creator_type: row.creator_type,
    creator_id: row.creator_id,
    parent_issue_id: row.parent_issue_id,
    project_id: null,
    position: row.position,
    stage: row.stage,
    start_date: iso(row.start_date),
    due_date: iso(row.due_date),
    metadata: row.metadata ?? {},
    properties: row.properties ?? {},
    reactions: [],
    labels: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    revision: row.revision,
  };
}

export async function getIssueById(id: string): Promise<IssueRow | null> {
  const sql = db();
  const rows = await sql`SELECT i.*, w.issue_prefix, s.name AS status_name, s.category AS status_category
                          FROM issue i
                          JOIN workspace w ON w.id = i.workspace_id
                          LEFT JOIN issue_status s ON s.workspace_id = i.workspace_id AND s.key = i.status
                          WHERE i.id = ${id}`;
  return (rows as IssueRow[])[0] ?? null;
}

export interface IssueFilters {
  workspace_id: string;
  q?: string;
  statuses?: string[];
  status_categories?: string[];
  priorities?: string[];
  assignee_id?: string;
  creator_id?: string;
  parent_issue_id?: string | null;
  parent_issue_id_set?: boolean;
  limit: number;
  offset: number;
}

export async function listIssues(f: IssueFilters): Promise<{ issues: IssueRow[]; total: number }> {
  const sql = db();
  const params: unknown[] = [f.workspace_id];
  let where = "i.workspace_id = $1";

  if (f.q) {
    params.push(`%${f.q}%`);
    where += ` AND i.title ILIKE $${params.length}`;
  }
  if (f.statuses?.length) {
    params.push(f.statuses);
    where += ` AND i.status = ANY($${params.length})`;
  }
  if (f.status_categories?.length) {
    params.push(f.status_categories);
    where += ` AND COALESCE(s.category, i.status) = ANY($${params.length})`;
  }
  if (f.priorities?.length) {
    params.push(f.priorities);
    where += ` AND i.priority = ANY($${params.length})`;
  }
  if (f.assignee_id) {
    params.push(f.assignee_id);
    where += ` AND i.assignee_id = $${params.length}`;
  }
  if (f.creator_id) {
    params.push(f.creator_id);
    where += ` AND i.creator_id = $${params.length}`;
  }
  if (f.parent_issue_id_set) {
    if (f.parent_issue_id) {
      params.push(f.parent_issue_id);
      where += ` AND i.parent_issue_id = $${params.length}`;
    } else {
      where += ` AND i.parent_issue_id IS NULL`;
    }
  }

  params.push(f.limit, f.offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const issues = await sql.query(
    `SELECT i.*, w.issue_prefix, s.name AS status_name, s.category AS status_category
     FROM issue i
     JOIN workspace w ON w.id = i.workspace_id
     LEFT JOIN issue_status s ON s.workspace_id = i.workspace_id AND s.key = i.status
     WHERE ${where}
     ORDER BY i.position ASC NULLS LAST, i.created_at ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  const totals = await sql.query(`SELECT COUNT(*)::int AS total FROM issue i
                             LEFT JOIN issue_status s ON s.workspace_id = i.workspace_id AND s.key = i.status
                             WHERE ${where}`, params.slice(0, -2));
  return {
    issues: issues as IssueRow[],
    total: (totals as Array<{ total: number }>)[0]?.total ?? 0,
  };
}

/** Atomically take the next per-workspace issue number (020_issue_number). */
export async function nextIssueNumber(workspaceId: string): Promise<{ number: number; prefix: string }> {
  const sql = db();
  const rows = await sql`UPDATE workspace SET issue_counter = issue_counter + 1, updated_at = now()
                          WHERE id = ${workspaceId}
                          RETURNING issue_counter, issue_prefix`;
  const row = (rows as Array<{ issue_counter: number; issue_prefix: string }>)[0];
  if (!row) throw new Error("workspace vanished while numbering");
  return { number: row.issue_counter, prefix: row.issue_prefix };
}

const PRIORITIES = new Set(["urgent", "high", "medium", "low", "none"]);
const ASSIGNEE_TYPES = new Set(["member", "agent", "squad"]);

export interface CreateIssueInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee_type?: string;
  assignee_id?: string;
  parent_issue_id?: string;
  stage?: number;
  start_date?: string;
  due_date?: string;
  properties?: Record<string, unknown>;
}

export async function insertIssue(
  workspaceId: string,
  creatorId: string,
  input: CreateIssueInput
): Promise<IssueRow> {
  const sql = db();
  const { number } = await nextIssueNumber(workspaceId);
  const priority = input.priority && PRIORITIES.has(input.priority) ? input.priority : "none";
  const status = input.status?.trim() || "backlog";
  const assigneeType =
    input.assignee_type && ASSIGNEE_TYPES.has(input.assignee_type) ? input.assignee_type : null;

  const rows = await sql`INSERT INTO issue
      (workspace_id, number, title, description, status, priority,
       assignee_type, assignee_id, creator_type, creator_id,
       parent_issue_id, properties, stage, start_date, due_date, position)
      VALUES (${workspaceId}, ${number}, ${input.title}, ${input.description ?? null},
              ${status}, ${priority}, ${assigneeType}, ${input.assignee_id ?? null},
              'member', ${creatorId}, ${input.parent_issue_id ?? null},
              ${JSON.stringify(input.properties ?? {})}::jsonb,
              ${input.stage ?? null},
              ${input.start_date ? new Date(input.start_date) : null},
              ${input.due_date ? new Date(input.due_date) : null},
              ${number * 1024})
      RETURNING id`;
  const id = (rows as Array<{ id: string }>)[0]?.id;
  if (!id) throw new Error("issue insert returned no id");
  return (await getIssueById(id))!;
}

const POSITION_STEP = 1024;

/** Compute the drop position between neighbor issues (board drag & drop). */
export async function positionBetween(
  workspaceId: string,
  beforeId: string | null,
  afterId: string | null
): Promise<number> {
  const sql = db();
  if (!beforeId && !afterId) {
    const rows = await sql`SELECT COALESCE(MAX(position), 0) + ${POSITION_STEP} AS p FROM issue
                            WHERE workspace_id = ${workspaceId}`;
    return (rows as Array<{ p: number }>)[0]?.p ?? POSITION_STEP;
  }
  const ids = [beforeId, afterId].filter(Boolean) as string[];
  const rows = await sql`SELECT id, position FROM issue
                          WHERE workspace_id = ${workspaceId} AND id = ANY(${ids})`;
  const byId = new Map((rows as Array<{ id: string; position: number }>).map((r) => [r.id, r.position]));
  const before = beforeId ? byId.get(beforeId) : undefined;
  const after = afterId ? byId.get(afterId) : undefined;
  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return before - POSITION_STEP;
  if (after != null) return after + POSITION_STEP;
  return Date.now(); // referenced issues vanished; park far away
}
