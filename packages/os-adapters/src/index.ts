import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LaunchEditorOptions {
  editorCommand?: string;
  path: string;
}

export interface LaunchBrowserOptions {
  url: string;
  profilePath: string;
  browserCommand?: string;
}

export interface NotifyOptions {
  title: string;
  body: string;
}

type TerminalBackend = "tmux" | "zellij" | "none";

export interface TerminalSessionResult {
  backend: TerminalBackend;
  attempted: boolean;
  created: boolean;
  focused: boolean;
  reason?: string;
}

export function ensureSiloDirs(): { rootDir: string; profileRoot: string; dbPath: string } {
  const rootDir = process.env.SILO_HOME_DIR || join(homedir(), ".silo");
  const profileRoot = join(rootDir, "profiles");
  const dbPath = join(rootDir, "silo.db");
  mkdirSync(profileRoot, { recursive: true });
  return { rootDir, profileRoot, dbPath };
}

export function launchEditor(options: LaunchEditorOptions): void {
  const command = options.editorCommand ?? (process.platform === "win32" ? "code.cmd" : "code");
  Bun.spawn([command, options.path], {
    stderr: "ignore",
    stdout: "ignore",
    stdin: "ignore",
    detached: true,
  });
}

export function launchBrowser(options: LaunchBrowserOptions): void {
  if (!existsSync(options.profilePath)) {
    mkdirSync(options.profilePath, { recursive: true });
  }

  const explicitBrowser = options.browserCommand ?? process.env.SILO_BROWSER_COMMAND;
  if (!explicitBrowser) {
    openUrlWithSystemBrowser(options.url);
    return;
  }

  const args = browserArgs(explicitBrowser, options.url, options.profilePath);
  try {
    Bun.spawn(args, {
      stderr: "ignore",
      stdout: "ignore",
      stdin: "ignore",
      detached: true,
    });
  } catch {
    openUrlWithSystemBrowser(options.url);
  }
}

export function notify(options: NotifyOptions): void {
  if (process.platform === "darwin") {
    Bun.spawn(["osascript", "-e", `display notification \"${safeApple(options.body)}\" with title \"${safeApple(options.title)}\"`]);
    return;
  }
  if (process.platform === "linux") {
    Bun.spawn(["notify-send", options.title, options.body]);
    return;
  }
  if (process.platform === "win32") {
    Bun.spawn([
      "powershell",
      "-NoProfile",
      "-Command",
      `New-BurntToastNotification -Text '${safePowershell(options.title)}','${safePowershell(options.body)}'`,
    ]);
  }
}

export function switchToTerminalSession(session: string, cwd?: string): TerminalSessionResult {
  const backend = resolveTerminalBackend();
  if (backend === "none") {
    return {
      backend,
      attempted: false,
      created: false,
      focused: false,
      reason: "No supported terminal backend found (tmux/zellij)",
    };
  }

  if (backend === "tmux") {
    return switchTmuxSession(session, cwd);
  }

  return switchZellijSession(session);
}

function openUrlWithSystemBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", url], {
        stderr: "ignore",
        stdout: "ignore",
        stdin: "ignore",
        detached: true,
      });
      return;
    }

    if (process.platform === "darwin") {
      Bun.spawn(["open", url], {
        stderr: "ignore",
        stdout: "ignore",
        stdin: "ignore",
        detached: true,
      });
      return;
    }

    Bun.spawn(["xdg-open", url], {
      stderr: "ignore",
      stdout: "ignore",
      stdin: "ignore",
      detached: true,
    });
  } catch {
    // no-op fallback to avoid crashing daemon on browser launch failures
  }
}

function browserArgs(command: string, url: string, profilePath: string): string[] {
  if (command.includes("chrome")) {
    return [command, `--user-data-dir=${profilePath}`, "--new-window", url];
  }
  if (command.includes("firefox")) {
    return [command, "-profile", profilePath, "-new-window", url];
  }
  return [command, url];
}

function switchTmuxSession(session: string, cwd?: string): TerminalSessionResult {
  const exists = runCommand(["tmux", "has-session", "-t", session]).ok;
  let created = false;

  if (!exists) {
    const createArgs = cwd
      ? ["tmux", "new-session", "-d", "-s", session, "-c", cwd]
      : ["tmux", "new-session", "-d", "-s", session];
    const createResult = runCommand(createArgs);
    if (!createResult.ok) {
      return {
        backend: "tmux",
        attempted: true,
        created: false,
        focused: false,
        reason: "Failed to create tmux session",
      };
    }
    created = true;
  }

  if (!process.env.TMUX) {
    return {
      backend: "tmux",
      attempted: true,
      created,
      focused: false,
      reason: "tmux session ensured; not currently inside tmux client",
    };
  }

  const focused = runCommand(["tmux", "switch-client", "-t", session]).ok;
  return {
    backend: "tmux",
    attempted: true,
    created,
    focused,
    reason: focused ? undefined : "Failed to focus tmux session",
  };
}

function switchZellijSession(session: string): TerminalSessionResult {
  if (!process.env.ZELLIJ) {
    return {
      backend: "zellij",
      attempted: false,
      created: false,
      focused: false,
      reason: "zellij detected but daemon is not running inside zellij",
    };
  }

  const focused = runCommand(["zellij", "action", "switch-session", session]).ok;
  return {
    backend: "zellij",
    attempted: true,
    created: false,
    focused,
    reason: focused ? undefined : "Failed to focus zellij session",
  };
}

function resolveTerminalBackend(): TerminalBackend {
  const override = (process.env.SILO_TERMINAL_BACKEND ?? "auto").toLowerCase();
  if (override === "none") return "none";
  if (override === "tmux") return commandExists("tmux") ? "tmux" : "none";
  if (override === "zellij") return commandExists("zellij") ? "zellij" : "none";

  if (commandExists("tmux")) return "tmux";
  if (commandExists("zellij")) return "zellij";
  return "none";
}

function commandExists(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  try {
    const result = Bun.spawnSync([checker, command], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function runCommand(args: string[]): { ok: boolean } {
  try {
    const result = Bun.spawnSync(args, {
      stdout: "ignore",
      stderr: "ignore",
    });
    return { ok: result.exitCode === 0 };
  } catch {
    return { ok: false };
  }
}

export interface DaemonInfo {
  host: string;
  port: number;
  url: string;
  pid: number;
  startedAt: string;
}

const daemonJsonPath = () => join(ensureSiloDirs().rootDir, "daemon.json");

export function writeDaemonInfo(info: DaemonInfo): void {
  writeFileSync(daemonJsonPath(), `${JSON.stringify(info, null, 2)}\n`, "utf8");
}

export function readDaemonInfo(): DaemonInfo | null {
  const filePath = daemonJsonPath();
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as DaemonInfo;
    if (parsed && typeof parsed.url === "string" && typeof parsed.port === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveDaemonUrl(): string {
  const envUrl = process.env.SILO_DAEMON_URL;
  if (envUrl) return envUrl;

  const info = readDaemonInfo();
  if (info) return info.url;

  return "http://127.0.0.1:4228";
}

function safeApple(value: string): string {
  return value.replace(/"/g, "'");
}

function safePowershell(value: string): string {
  return value.replace(/'/g, "''");
}
