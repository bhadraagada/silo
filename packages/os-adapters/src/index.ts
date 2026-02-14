import { existsSync, mkdirSync } from "node:fs";
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

export function ensureSiloDirs(): { rootDir: string; profileRoot: string; dbPath: string } {
  const rootDir = join(homedir(), ".silo");
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

  const browser = options.browserCommand ?? defaultBrowserCommand();
  const args = browserArgs(browser, options.url, options.profilePath);
  Bun.spawn(args, {
    stderr: "ignore",
    stdout: "ignore",
    stdin: "ignore",
    detached: true,
  });
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

export function switchToTerminalSession(session: string): void {
  if (process.platform === "darwin") {
    Bun.spawn(["osascript", "-e", `tell application \"Terminal\" to activate`]);
    return;
  }
  if (process.platform === "linux") {
    Bun.spawn(["sh", "-lc", "true"]);
    return;
  }
  if (process.platform === "win32") {
    Bun.spawn(["powershell", "-NoProfile", "-Command", "Write-Output \"focus terminal\""]);
  }
  void session;
}

function defaultBrowserCommand(): string {
  if (process.platform === "darwin") return "google-chrome";
  if (process.platform === "linux") return "google-chrome";
  return "chrome";
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

function safeApple(value: string): string {
  return value.replace(/"/g, "'");
}

function safePowershell(value: string): string {
  return value.replace(/'/g, "''");
}
