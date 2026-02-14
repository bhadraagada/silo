import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface EnsureWorktreeInput {
  repoPath: string;
  branch: string;
  workspaceSlug: string;
}

export interface EnsureWorktreeResult {
  worktreePath: string;
}

export interface GitExecResult {
  success: boolean;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface ReviewSnapshot {
  branch: string;
  changedFiles: string[];
  statusPorcelain: string;
  diff: string;
  recentCommits: string;
}

export interface ShipOptions {
  commitMessage: string;
  runChecks?: boolean;
  checks?: string[];
  openPr?: boolean;
  prTitle?: string;
  prBody?: string;
}

export interface ShipResult {
  committed: boolean;
  commitMessage: string;
  commitSha: string | null;
  checks: Array<{ name: string; success: boolean; output: string }>;
  prUrl: string | null;
}

function runGit(args: string[], cwd: string): GitExecResult {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function runCommand(command: string[], cwd: string): GitExecResult {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function ensureWorktree(input: EnsureWorktreeInput): EnsureWorktreeResult {
  const basePath = join(input.repoPath, ".silo", "worktrees", input.workspaceSlug);
  mkdirSync(dirname(basePath), { recursive: true });

  if (existsSync(basePath)) {
    return { worktreePath: basePath };
  }

  const branchCheck = runGit(["rev-parse", "--verify", input.branch], input.repoPath);
  const addArgs = branchCheck.success
    ? ["worktree", "add", basePath, input.branch]
    : ["worktree", "add", "-b", input.branch, basePath];
  const addResult = runGit(addArgs, input.repoPath);

  if (!addResult.success) {
    throw new Error(`Failed to create worktree: ${addResult.stderr || addResult.stdout}`);
  }

  return { worktreePath: basePath };
}

export function repoRoot(cwd: string): string {
  const result = runGit(["rev-parse", "--show-toplevel"], cwd);
  if (!result.success) {
    throw new Error(`Unable to resolve git root in ${cwd}. ${result.stderr}`);
  }
  return result.stdout.trim();
}

export function currentBranch(cwd: string): string {
  const result = runGit(["branch", "--show-current"], cwd);
  if (!result.success) {
    throw new Error(`Unable to resolve current branch in ${cwd}. ${result.stderr}`);
  }
  return result.stdout.trim();
}

export function reviewWorkspace(cwd: string): ReviewSnapshot {
  const branch = currentBranch(cwd);
  const status = runGit(["status", "--porcelain"], cwd);
  const diff = runGit(["diff", "--", "."], cwd);
  const recent = runGit(["log", "--oneline", "-n", "15"], cwd);

  if (!status.success || !diff.success || !recent.success) {
    throw new Error("Unable to generate review snapshot from git");
  }

  const changedFiles = status.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3));

  return {
    branch,
    changedFiles,
    statusPorcelain: status.stdout,
    diff: diff.stdout,
    recentCommits: recent.stdout,
  };
}

export function shipWorkspace(cwd: string, options: ShipOptions): ShipResult {
  const checks: Array<{ name: string; success: boolean; output: string }> = [];
  if (options.runChecks) {
    const defaultChecks = options.checks?.length ? options.checks : ["typecheck", "test", "build"];
    for (const check of defaultChecks) {
      const checkExec = runCommand(["bun", "run", check], cwd);
      checks.push({
        name: check,
        success: checkExec.success,
        output: `${checkExec.stdout}${checkExec.stderr}`,
      });
      if (!checkExec.success) {
        throw new Error(`Ship check failed: ${check}`);
      }
    }
  }

  const preStatus = runGit(["status", "--porcelain"], cwd);
  if (!preStatus.success) {
    throw new Error(`Unable to read git status before ship: ${preStatus.stderr}`);
  }

  if (!preStatus.stdout.trim()) {
    return {
      committed: false,
      commitMessage: options.commitMessage,
      commitSha: null,
      checks,
      prUrl: null,
    };
  }

  const add = runGit(["add", "-A"], cwd);
  if (!add.success) {
    throw new Error(`Unable to stage changes: ${add.stderr}`);
  }

  const commit = runGit(["commit", "-m", options.commitMessage], cwd);
  if (!commit.success) {
    throw new Error(`Commit failed: ${commit.stderr || commit.stdout}`);
  }

  const head = runGit(["rev-parse", "HEAD"], cwd);
  const commitSha = head.success ? head.stdout.trim() : null;

  let prUrl: string | null = null;
  if (options.openPr) {
    const title = options.prTitle ?? options.commitMessage;
    const body = options.prBody ?? "## Summary\n- Automated PR opened by silo ship workflow.";
    const pr = runCommand(["gh", "pr", "create", "--title", title, "--body", body], cwd);
    if (pr.success) {
      prUrl = pr.stdout.trim().split("\n").filter(Boolean).at(-1) ?? null;
    }
  }

  return {
    committed: true,
    commitMessage: options.commitMessage,
    commitSha,
    checks,
    prUrl,
  };
}
