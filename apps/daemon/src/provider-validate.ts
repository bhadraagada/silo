import { spawnSync } from "node:child_process";
import { resolveApiKey, type ProviderProfilesConfig, type ProviderSettings } from "./provider-profiles";

export interface ProviderValidationEntry {
  provider: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

export interface ProviderValidationReport {
  profile: string;
  ok: boolean;
  entries: ProviderValidationEntry[];
}

export async function validateProviderProfile(
  config: ProviderProfilesConfig,
  profileName: string
): Promise<ProviderValidationReport> {
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`Provider profile '${profileName}' not found`);
  }

  const entries: ProviderValidationEntry[] = [];
  for (const [provider, settings] of Object.entries(profile.providers)) {
    entries.push(await validateProvider(provider, settings ?? {}));
  }

  const ok = entries.every((entry) => entry.ok);
  return {
    profile: profileName,
    ok,
    entries,
  };
}

async function validateProvider(provider: string, settings: ProviderSettings): Promise<ProviderValidationEntry> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const normalized = provider.toLowerCase();

  if (normalized === "openai") {
    const apiKey = resolveApiKey(settings);
    checks.push({
      name: "api-key",
      ok: Boolean(apiKey),
      detail: apiKey ? "API key resolved" : "Missing API key (inline, env, or secure store ref)",
    });
    if (apiKey) {
      const model = settings.model ?? "gpt-4.1-mini";
      const ping = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      let modelAvailable = false;
      if (ping.ok) {
        const payload = (await ping.json()) as { data?: Array<{ id?: string }> };
        modelAvailable = (payload.data ?? []).some((item) => item.id === model);
      }
      checks.push({
        name: "connectivity",
        ok: ping.ok,
        detail: ping.ok ? `OpenAI reachable (model target: ${model})` : `OpenAI request failed (${ping.status})`,
      });
      checks.push({
        name: "model-availability",
        ok: modelAvailable,
        detail: modelAvailable ? `${model} available` : `${model} not found in available models`,
      });
    }
  } else if (normalized === "claude-api" || normalized === "anthropic") {
    const apiKey = resolveApiKey(settings);
    checks.push({
      name: "api-key",
      ok: Boolean(apiKey),
      detail: apiKey ? "API key resolved" : "Missing API key (inline, env, or secure store ref)",
    });
    if (apiKey) {
      const ping = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model ?? "claude-3-7-sonnet-latest",
          max_tokens: 8,
          messages: [{ role: "user", content: "Respond with exactly: ok" }],
        }),
      });
      checks.push({
        name: "connectivity",
        ok: ping.ok,
        detail: ping.ok ? "Anthropic reachable with test completion" : `Anthropic request failed (${ping.status})`,
      });
    }
  } else {
    const command = settings.command ?? normalized;
    const binary = checkBinary(command);
    checks.push({
      name: "binary",
      ok: binary.ok,
      detail: binary.detail,
    });
  }

  return {
    provider,
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function checkBinary(command: string): { ok: boolean; detail: string } {
  const isWin = process.platform === "win32";
  const shell = isWin ? "where" : "which";
  const result = spawnSync(shell, [command], { encoding: "utf8" });
  const ok = (result.status ?? 1) === 0;
  return {
    ok,
    detail: ok ? `${command} found` : `${command} not found in PATH`,
  };
}
