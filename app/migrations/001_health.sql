CREATE TABLE IF NOT EXISTS workspaces (
 id UUID PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
 settings JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observations (
 workspace UUID NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL,
 kind TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, body JSONB NOT NULL,
 PRIMARY KEY(workspace,id)
);
CREATE INDEX IF NOT EXISTS observations_workspace_time ON observations(workspace,occurred_at DESC);
CREATE INDEX IF NOT EXISTS observations_workspace_kind_time ON observations(workspace,kind,occurred_at DESC);
CREATE TABLE IF NOT EXISTS summaries (
 id TEXT PRIMARY KEY, workspace UUID NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL,
 digest TEXT NOT NULL, body JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace,kind,digest)
);
CREATE INDEX IF NOT EXISTS summaries_workspace_time ON summaries(workspace,created_at DESC);
CREATE TABLE IF NOT EXISTS acknowledgements (
 workspace UUID NOT NULL REFERENCES workspaces(id), alert_id TEXT NOT NULL,
 acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(workspace,alert_id)
);
CREATE TABLE IF NOT EXISTS audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace UUID NOT NULL REFERENCES workspaces(id), revision BIGINT, event TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_workspace_time ON audit(workspace,created_at DESC);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT NOT NULL,
 content TEXT NOT NULL, topics TEXT[] NOT NULL, reviewed_at DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_topics ON knowledge_chunks USING GIN(topics);
CREATE INDEX IF NOT EXISTS knowledge_search ON knowledge_chunks USING GIN(to_tsvector('simple',content));
