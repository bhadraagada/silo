export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      repo_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      task TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      branch TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      browser_profile_path TEXT NOT NULL,
      domain TEXT NOT NULL,
      app_port INTEGER NOT NULL,
      api_port INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );`,
  `CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      session_id TEXT,
      parent_run_id TEXT,
      token_input INTEGER NOT NULL DEFAULT 0,
      token_output INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );`,
  `CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );`,
  `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );`,
];

/**
 * Migrations for existing databases created before new columns were added.
 * Each statement is run in a try/catch so already-applied migrations are safe to skip.
 */
export const migrationStatements = [
  `ALTER TABLE runs ADD COLUMN session_id TEXT;`,
  `ALTER TABLE runs ADD COLUMN parent_run_id TEXT;`,
];
