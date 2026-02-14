import { describe, expect, test } from "bun:test";
import { hashToPort, makeBranch, makeDomain, makeWorkspaceSlug, toSafeSlug } from "../src/utils";

describe("slug utilities", () => {
  test("normalizes mixed input into safe slug", () => {
    expect(toSafeSlug("  My Project__Name!!!  ")).toBe("my-project-name");
  });

  test("builds workspace slug from project and task", () => {
    expect(makeWorkspaceSlug("My Project", "First Flow")).toBe("my-project-first-flow");
  });

  test("builds silo branch from task", () => {
    expect(makeBranch("first flow")).toBe("silo/first-flow");
  });

  test("builds deterministic dev domain", () => {
    expect(makeDomain("demo-first-flow")).toBe("demo-first-flow.dev.local");
  });
});

describe("port hashing", () => {
  test("returns deterministic ports for the same seed", () => {
    const first = hashToPort("demo-first-flow:app");
    const second = hashToPort("demo-first-flow:app");
    expect(first).toBe(second);
  });

  test("keeps ports in configured range", () => {
    const value = hashToPort("demo-first-flow:api", 20000, 20000);
    expect(value).toBeGreaterThanOrEqual(20000);
    expect(value).toBeLessThan(40000);
  });
});
