import { describe, expect, test } from "bun:test";
import { buildProviderApiKeyRef } from "../src/keychain";

describe("buildProviderApiKeyRef", () => {
  test("normalizes profile and provider names into a stable ref", () => {
    const ref = buildProviderApiKeyRef("Default Team", "OpenAI/API");
    expect(ref).toBe("silo://provider-key/default-team/openai-api");
  });
});
