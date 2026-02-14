import { spawnSync } from "node:child_process";

export interface GatewayReloadResult {
  caddyReloaded: boolean;
  traefikReloaded: boolean;
  caddyOutput: string;
  traefikOutput: string;
}

export function runGatewayReloadHooks(caddyFilePath: string, traefikFilePath: string): GatewayReloadResult {
  const caddyCommand =
    process.env.SILO_CADDY_RELOAD_CMD ??
    (process.env.SILO_AUTO_RELOAD_CADDY === "1" ? `caddy reload --config "${caddyFilePath}"` : undefined);
  const traefikCommand = process.env.SILO_TRAEFIK_RELOAD_CMD;

  const caddyExec = caddyCommand ? runShell(caddyCommand) : null;
  const traefikExec = traefikCommand ? runShell(traefikCommand.replace("{file}", traefikFilePath)) : null;

  return {
    caddyReloaded: caddyExec ? caddyExec.success : false,
    traefikReloaded: traefikExec ? traefikExec.success : false,
    caddyOutput: caddyExec ? `${caddyExec.stdout}${caddyExec.stderr}` : "caddy reload skipped",
    traefikOutput: traefikExec ? `${traefikExec.stdout}${traefikExec.stderr}` : "traefik reload skipped",
  };
}

function runShell(command: string): { success: boolean; stdout: string; stderr: string } {
  const isWin = process.platform === "win32";
  const shell = isWin ? "cmd" : "sh";
  const args = isWin ? ["/c", command] : ["-lc", command];
  const result = spawnSync(shell, args, {
    encoding: "utf8",
  });
  return {
    success: (result.status ?? 1) === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
