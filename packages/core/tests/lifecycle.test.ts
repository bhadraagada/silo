import { describe, expect, test } from "bun:test";
import { createWorkspaceSeed } from "../src/lifecycle";

describe("createWorkspaceSeed", () => {
  test("builds deterministic slug, branch, domain, and ports", () => {
    const input = {
      projectSlug: "demo-project",
      task: "first flow",
      repoPath: "C:/repos/demo-project",
    };

    const first = createWorkspaceSeed(input);
    const second = createWorkspaceSeed(input);

    expect(first.slug).toBe("demo-project-first-flow");
    expect(first.branch).toBe("silo/first-flow");
    expect(first.domain).toBe("demo-project-first-flow.dev.local");
    expect(first.profileDirName).toBe(first.slug);
    expect(first.appPort).toBe(second.appPort);
    expect(first.apiPort).toBe(second.apiPort);
  });

  test("generates distinct app and api ports", () => {
    const seed = createWorkspaceSeed({
      projectSlug: "demo",
      task: "queue tuning",
      repoPath: "C:/repos/demo",
    });

    expect(seed.appPort).not.toBe(seed.apiPort);
  });
});
