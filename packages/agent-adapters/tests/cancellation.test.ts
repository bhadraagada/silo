import { describe, expect, test } from "bun:test";
import { getAdapter } from "../src/index";

describe("command adapter cancellation", () => {
  test("aborts an active CLI command when signal is cancelled", async () => {
    const adapter = getAdapter("codex");
    const controller = new AbortController();

    const runPromise = adapter.run(
      {
        workspaceId: "ws-test",
        workspacePath: process.cwd(),
        prompt: "noop",
        provider: "codex",
        providerConfig: {
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 5000)"],
          timeoutMs: 8000,
        },
        abortSignal: controller.signal,
      },
      () => {
        // ignore emitted events in this unit test
      }
    );

    setTimeout(() => controller.abort(), 40);

    await expect(runPromise).rejects.toThrow("Run cancelled");
  });
});
