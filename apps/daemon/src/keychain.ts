import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { ensureSiloDirs } from "@silo/os-adapters";

const SECRET_SERVICE = "silo.provider.api-key";
const REF_PREFIX = "silo://provider-key/";

export function buildProviderApiKeyRef(profile: string, provider: string): string {
  return `${REF_PREFIX}${safeSegment(profile)}/${safeSegment(provider)}`;
}

export function storeProviderApiKey(profile: string, provider: string, apiKey: string): string {
  const ref = buildProviderApiKeyRef(profile, provider);
  const result = storeSecret(ref, apiKey);
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return ref;
}

export function readProviderApiKey(ref: string): string | undefined {
  const result = readSecret(ref);
  if (!result.ok) {
    return undefined;
  }
  return result.value;
}

function storeSecret(ref: string, secret: string): { ok: boolean; detail: string } {
  if (process.platform === "darwin") {
    const result = spawnSync(
      "security",
      ["add-generic-password", "-U", "-s", SECRET_SERVICE, "-a", ref, "-w", secret],
      { encoding: "utf8" }
    );
    if ((result.status ?? 1) !== 0) {
      return { ok: false, detail: `Failed to store API key in macOS Keychain: ${(result.stderr || result.stdout).trim()}` };
    }
    return { ok: true, detail: "stored" };
  }

  if (process.platform === "linux") {
    const result = spawnSync(
      "secret-tool",
      ["store", "--label", "silo provider api key", "service", SECRET_SERVICE, "account", ref],
      { encoding: "utf8", input: secret }
    );
    if ((result.status ?? 1) !== 0) {
      return {
        ok: false,
        detail: `Failed to store API key in Linux keyring (secret-tool): ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return { ok: true, detail: "stored" };
  }

  if (process.platform === "win32") {
    const encrypted = encryptWithDpapi(secret);
    if (!encrypted.ok) {
      return encrypted;
    }
    const store = loadWindowsStore();
    store[ref] = encrypted.value;
    saveWindowsStore(store);
    return { ok: true, detail: "stored" };
  }

  return {
    ok: false,
    detail: "Secure provider key storage is not supported on this platform.",
  };
}

function readSecret(ref: string): { ok: boolean; value: string; detail: string } {
  if (process.platform === "darwin") {
    const result = spawnSync("security", ["find-generic-password", "-s", SECRET_SERVICE, "-a", ref, "-w"], {
      encoding: "utf8",
    });
    if ((result.status ?? 1) !== 0) {
      return { ok: false, value: "", detail: "missing" };
    }
    return { ok: true, value: result.stdout.trim(), detail: "resolved" };
  }

  if (process.platform === "linux") {
    const result = spawnSync("secret-tool", ["lookup", "service", SECRET_SERVICE, "account", ref], {
      encoding: "utf8",
    });
    if ((result.status ?? 1) !== 0) {
      return { ok: false, value: "", detail: "missing" };
    }
    return { ok: true, value: result.stdout.trim(), detail: "resolved" };
  }

  if (process.platform === "win32") {
    const store = loadWindowsStore();
    const encrypted = store[ref];
    if (!encrypted) {
      return { ok: false, value: "", detail: "missing" };
    }
    const decrypted = decryptWithDpapi(encrypted);
    if (!decrypted.ok) {
      return { ok: false, value: "", detail: decrypted.detail };
    }
    return { ok: true, value: decrypted.value, detail: "resolved" };
  }

  return { ok: false, value: "", detail: "unsupported" };
}

function encryptWithDpapi(secret: string): { ok: boolean; value: string; detail: string } {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "$secret = ConvertTo-SecureString $env:SILO_SECRET_VALUE -AsPlainText -Force; ConvertFrom-SecureString $secret",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SILO_SECRET_VALUE: secret,
      },
    }
  );
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      value: "",
      detail: `Failed to encrypt API key with Windows DPAPI: ${(result.stderr || result.stdout).trim()}`,
    };
  }
  return { ok: true, value: result.stdout.trim(), detail: "encrypted" };
}

function decryptWithDpapi(encrypted: string): { ok: boolean; value: string; detail: string } {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$secure = ConvertTo-SecureString $env:SILO_ENCRYPTED_VALUE;",
        "$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);",
        "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }",
      ].join(" "),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SILO_ENCRYPTED_VALUE: encrypted,
      },
    }
  );
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      value: "",
      detail: `Failed to decrypt API key from Windows DPAPI: ${(result.stderr || result.stdout).trim()}`,
    };
  }
  return { ok: true, value: result.stdout.trim(), detail: "decrypted" };
}

function windowsStorePath(): string {
  return join(ensureSiloDirs().rootDir, "secrets", "windows-dpapi.json");
}

function loadWindowsStore(): Record<string, string> {
  const filePath = windowsStorePath();
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}

function saveWindowsStore(store: Record<string, string>): void {
  const filePath = windowsStorePath();
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  try {
    chmodSync(directory, 0o700);
  } catch {
    // best effort on platforms that ignore POSIX modes
  }

  try {
    chmodSync(filePath, 0o600);
  } catch {
    // best effort on platforms that ignore POSIX modes
  }
}

function safeSegment(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}
