import { afterEach, describe, expect, test } from "bun:test";
import {
  __setSpawnSyncForTests,
  buildProviderApiKeyRef,
  readProviderApiKey,
  storeProviderApiKey,
} from "../src/keychain";

describe("buildProviderApiKeyRef", () => {
  test("normalizes profile and provider names into a stable ref", () => {
    const ref = buildProviderApiKeyRef("Default Team", "OpenAI/API");
    expect(ref).toBe("silo://provider-key/default-team/openai-api");
  });
});

describe("keychain store/read", () => {
  afterEach(() => {
    __setSpawnSyncForTests(null);
  });

  test("stores and reads an API key through the active platform backend", () => {
    if (process.platform === "win32") {
      // Windows path writes DPAPI ciphertext to local store; keep this test command-only.
      expect(true).toBe(true);
      return;
    }

    const calls: Array<{ command: string; args: string[]; input?: unknown }> = [];
    const secret = "sk-test-abc";

    __setSpawnSyncForTests(((command: string, args?: readonly string[], options?: Record<string, unknown>) => {
      const normalizedArgs = [...(args ?? [])];
      calls.push({ command, args: normalizedArgs, input: options?.input });

      if (process.platform === "linux" && command === "secret-tool" && normalizedArgs[0] === "store") {
        return { status: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
      }
      if (process.platform === "linux" && command === "secret-tool" && normalizedArgs[0] === "lookup") {
        return { status: 0, stdout: Buffer.from(`${secret}\n`), stderr: Buffer.from("") };
      }

      if (process.platform === "darwin" && command === "security" && normalizedArgs[0] === "add-generic-password") {
        return { status: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
      }
      if (process.platform === "darwin" && command === "security" && normalizedArgs[0] === "find-generic-password") {
        return { status: 0, stdout: Buffer.from(`${secret}\n`), stderr: Buffer.from("") };
      }

      return { status: 1, stdout: Buffer.from(""), stderr: Buffer.from("unexpected command") };
    }) as unknown as typeof import("node:child_process").spawnSync);

    const ref = storeProviderApiKey("Default Team", "openai", secret);
    const resolved = readProviderApiKey(ref);

    expect(ref).toBe("silo://provider-key/default-team/openai");
    expect(resolved).toBe(secret);
    expect(calls.length).toBe(2);
  });

  test("returns undefined when secure store lookup fails", () => {
    if (process.platform === "win32") {
      expect(true).toBe(true);
      return;
    }

    __setSpawnSyncForTests(((command: string, args?: readonly string[]) => {
      const normalizedArgs = [...(args ?? [])];
      if (
        (process.platform === "linux" && command === "secret-tool" && normalizedArgs[0] === "lookup")
        || (process.platform === "darwin" && command === "security" && normalizedArgs[0] === "find-generic-password")
      ) {
        return { status: 1, stdout: Buffer.from(""), stderr: Buffer.from("missing") };
      }
      return { status: 1, stdout: Buffer.from(""), stderr: Buffer.from("unexpected") };
    }) as unknown as typeof import("node:child_process").spawnSync);

    expect(readProviderApiKey("silo://provider-key/default/openai")).toBeUndefined();
  });
});
