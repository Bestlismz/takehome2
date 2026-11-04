CREATE TABLE IF NOT EXISTS care_workflows (
 workspace UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
 body JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS care_workflow_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 revision BIGINT NOT NULL, operation TEXT NOT NULL, target_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_workflow_audit_workspace ON care_workflow_audit(workspace,id DESC);
CREATE TABLE IF NOT EXISTS care_access_grants (
 id UUID PRIMARY KEY, workspace UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, scope TEXT NOT NULL CHECK (scope = 'family_summary'),
 label TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS care_access_grants_workspace ON care_access_grants(workspace);
