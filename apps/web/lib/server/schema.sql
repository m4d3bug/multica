-- Multica Phase-1 schema for Neon (Postgres).
-- Derived from the Go server's migrations (001_init, 020_issue_number,
-- 332_issue_status) reduced to the tables the Next.js backend implements.
-- Tables intentionally omitted (their endpoints return empty/404 in Phase 1):
--   agent, agent_task_queue, daemon_connection, inbox_item, activity_log,
--   project, label, squad, property, issue_dependency.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    onboarded_at TIMESTAMPTZ,
    onboarding_questionnaire JSONB NOT NULL DEFAULT '{}',
    language TEXT,
    profile_description TEXT NOT NULL DEFAULT '',
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,                -- opaque random token
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_code (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_code_email ON verification_code(email, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    issue_prefix TEXT NOT NULL DEFAULT 'WS',
    issue_counter INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS issue_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    key TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,31}$'),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled')),
    color TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, key),
    CONSTRAINT issue_status_system_is_canonical CHECK (NOT is_system OR key = category),
    CONSTRAINT issue_status_system_not_archivable CHECK (NOT is_system OR archived_at IS NULL)
);

CREATE TABLE IF NOT EXISTS issue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    number INT NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
    assignee_type TEXT CHECK (assignee_type IN ('member', 'agent', 'squad')),
    assignee_id UUID,
    creator_type TEXT NOT NULL CHECK (creator_type IN ('member', 'agent')),
    creator_id UUID NOT NULL,
    parent_issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    properties JSONB NOT NULL DEFAULT '{}',
    stage INT CHECK (stage IS NULL OR stage >= 1),
    start_date TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, number)
);
CREATE INDEX IF NOT EXISTS idx_issue_workspace ON issue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_issue_status ON issue(workspace_id, status);

CREATE TABLE IF NOT EXISTS comment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('member', 'agent')),
    author_id UUID NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'comment' CHECK (type IN ('comment', 'status_change', 'progress_update', 'system')),
    parent_id UUID REFERENCES comment(id) ON DELETE SET NULL,
    reactions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comment_issue ON comment(issue_id);
