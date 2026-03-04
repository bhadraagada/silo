import { describe, expect, test } from "bun:test";
import { resolveApiKey } from "../src/provider-profiles";

describe("resolveApiKey", () => {
  test("returns inline apiKey when no ref is configured", () => {
    expect(resolveApiKey({ apiKey: "inline-key" })).toBe("inline-key");
  });

  test("does not fall back to inline key when apiKeyRef is configured but unresolved", () => {
    const missingRef = `silo://provider-key/test-${Date.now()}-${Math.random()}/openai`;
    expect(resolveApiKey({ apiKeyRef: missingRef, apiKey: "fallback-inline" })).toBeUndefined();
  });
});
