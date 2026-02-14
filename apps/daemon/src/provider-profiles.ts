import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureSiloDirs } from "@silo/os-adapters";

export type ProviderKey = "openai" | "claude-api" | "codex" | "claude" | "opencode";

export type ProviderSettings = {
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  maxTokens?: number;
  command?: string;
  args?: string[];
  timeoutMs?: number;
};

export interface ProviderProfile {
  name: string;
  providers: Partial<Record<ProviderKey, ProviderSettings>>;
}

export interface ProviderProfilesConfig {
  defaultProfile: string;
  profiles: Record<string, ProviderProfile>;
}

export interface ResolvedProviderConfig {
  profileName: string;
  provider: ProviderKey | string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  command?: string;
  args?: string[];
  timeoutMs?: number;
}

const profilesPath = join(ensureSiloDirs().rootDir, "providers.json");

export function loadProfiles(): ProviderProfilesConfig {
  ensureProfilesFile();
  const raw = readFileSync(profilesPath, "utf8");
  const parsed = JSON.parse(raw) as ProviderProfilesConfig;
  if (!parsed.defaultProfile || !parsed.profiles) {
    throw new Error("Invalid providers.json format");
  }
  const migrated = applyProfileMigrations(parsed);
  if (migrated.updated) {
    saveProfiles(migrated.config);
  }
  return migrated.config;
}

export function saveProfiles(config: ProviderProfilesConfig): void {
  mkdirSync(dirname(profilesPath), { recursive: true });
  writeFileSync(profilesPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function resolveProviderConfig(provider: string, profileName?: string): ResolvedProviderConfig {
  const config = loadProfiles();
  const selectedProfile = profileName ?? config.defaultProfile;
  const profile = config.profiles[selectedProfile];
  if (!profile) {
    throw new Error(`Provider profile '${selectedProfile}' not found`);
  }

  const normalized = provider.toLowerCase() as ProviderKey;
  const settings = profile.providers[normalized] ?? {};

  const apiKey = settings.apiKey ?? (settings.apiKeyEnv ? process.env[settings.apiKeyEnv] : undefined);
  return {
    profileName: selectedProfile,
    provider,
    apiKey,
    model: settings.model,
    maxTokens: settings.maxTokens,
    command: settings.command,
    args: settings.args,
    timeoutMs: settings.timeoutMs,
  };
}

export function setDefaultProfile(name: string): ProviderProfilesConfig {
  const config = loadProfiles();
  if (!config.profiles[name]) {
    throw new Error(`Cannot set default profile. Profile '${name}' does not exist.`);
  }
  const updated: ProviderProfilesConfig = {
    ...config,
    defaultProfile: name,
  };
  saveProfiles(updated);
  return updated;
}

export function upsertProviderProfile(name: string, provider: string, settings: ProviderSettings): ProviderProfilesConfig {
  const config = loadProfiles();
  const providerKey = provider.toLowerCase() as ProviderKey;

  const existing = config.profiles[name] ?? { name, providers: {} };
  const updatedProfile: ProviderProfile = {
    ...existing,
    providers: {
      ...existing.providers,
      [providerKey]: settings,
    },
  };

  const next = {
    ...config,
    profiles: {
      ...config.profiles,
      [name]: updatedProfile,
    },
  };
  saveProfiles(next);
  return next;
}

export function providersFilePath(): string {
  ensureProfilesFile();
  return profilesPath;
}

function ensureProfilesFile(): void {
  if (existsSync(profilesPath)) {
    return;
  }
  mkdirSync(dirname(profilesPath), { recursive: true });
  saveProfiles(defaultProfiles());
}

function defaultProfiles(): ProviderProfilesConfig {
  return {
    defaultProfile: "default",
    profiles: {
      default: {
        name: "default",
        providers: {
          openai: {
            apiKeyEnv: "OPENAI_API_KEY",
            model: "gpt-4.1-mini",
          },
          "claude-api": {
            apiKeyEnv: "ANTHROPIC_API_KEY",
            model: "claude-3-7-sonnet-latest",
            maxTokens: 1200,
          },
          codex: {
            command: "codex",
            args: ["exec", "--dangerously-bypass-approvals-and-sandbox", "{prompt}"],
          },
          claude: {
            command: "claude",
            args: [
              "-p",
              "{prompt}",
              "--allow-dangerously-skip-permissions",
              "--dangerously-skip-permissions",
              "--permission-mode",
              "bypassPermissions",
            ],
          },
          opencode: {
            command: "opencode",
            args: ["run", "--format", "json", "{prompt}"],
          },
        },
      },
    },
  };
}

function applyProfileMigrations(config: ProviderProfilesConfig): { config: ProviderProfilesConfig; updated: boolean } {
  let updated = false;
  const profiles: Record<string, ProviderProfile> = {};

  for (const [name, profile] of Object.entries(config.profiles)) {
    const providers = { ...profile.providers };

    const codex = providers.codex;
    if (codex && shouldMigrateArgs(codex.args, ["--yolo"])) {
      providers.codex = { ...codex, args: ["exec", "--dangerously-bypass-approvals-and-sandbox", "{prompt}"] };
      updated = true;
    }

    const claude = providers.claude;
    if (claude && shouldMigrateArgs(claude.args, [])) {
      providers.claude = {
        ...claude,
        args: [
          "-p",
          "{prompt}",
          "--allow-dangerously-skip-permissions",
          "--dangerously-skip-permissions",
          "--permission-mode",
          "bypassPermissions",
        ],
      };
      updated = true;
    }

    const opencode = providers.opencode;
    if (opencode && shouldMigrateArgs(opencode.args, ["--yolo"])) {
      providers.opencode = { ...opencode, args: ["run", "--format", "json", "{prompt}"] };
      updated = true;
    }

    profiles[name] = {
      ...profile,
      providers,
    };
  }

  return {
    config: {
      ...config,
      profiles,
    },
    updated,
  };
}

function shouldMigrateArgs(existing: string[] | undefined, legacyTokens: string[]): boolean {
  if (!Array.isArray(existing) || existing.length === 0) {
    return true;
  }
  return legacyTokens.some((token) => existing.includes(token));
}
