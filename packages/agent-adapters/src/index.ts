import { nowIso, newId } from "@silo/core";
import type { EventType } from "@silo/core";

export interface AgentEvent {
  id: string;
  ts: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface ProviderRuntimeConfig {
  profileName?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  command?: string;
  args?: string[];
  timeoutMs?: number;
}

export interface RunContext {
  workspaceId: string;
  workspacePath: string;
  prompt: string;
  provider: string;
  providerConfig?: ProviderRuntimeConfig;
  continueSessionId?: string;
  parentRunId?: string;
  abortSignal?: AbortSignal;
}

export interface RunResult {
  summary: string;
  sessionId: string | null;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
}

export interface AgentAdapter {
  run(context: RunContext, onEvent: (event: AgentEvent) => void): Promise<RunResult>;
}

class MockAgentAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (event: AgentEvent) => void): Promise<RunResult> {
    throwIfAborted(context.abortSignal);
    const isContinue = Boolean(context.continueSessionId);
    onEvent(event("run.started", { provider: context.provider, prompt: context.prompt, continue: isContinue }));
    onEvent(event("tool.started", { tool: "analysis", step: "inspect workspace" }));
    await sleepWithAbort(200, context.abortSignal);
    onEvent(event("tool.finished", { tool: "analysis", ok: true }));
    onEvent(event("llm.usage", { input: 280, output: 540, model: "mock" }));
    await sleepWithAbort(300, context.abortSignal);
    throwIfAborted(context.abortSignal);
    onEvent(event("run.completed", { result: "Changes drafted and validated." }));
    return {
      summary: isContinue
        ? `Mock continue completed (session ${context.continueSessionId}).`
        : "Mock run completed: drafted and validated workspace changes.",
      sessionId: context.continueSessionId ?? `mock-session-${newId("ses")}`,
      tokenInput: 280,
      tokenOutput: 540,
      costUsd: 0,
    };
  }
}

class OpenAIAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
    throwIfAborted(context.abortSignal);
    const apiKey = context.providerConfig?.apiKey;
    if (!apiKey) {
      throw new Error("OpenAI API key missing. Configure provider profile or set OPENAI_API_KEY.");
    }

    const model = context.providerConfig?.model ?? "gpt-4.1-mini";
    onEvent(event("run.started", { provider: "openai", model, profile: context.providerConfig?.profileName }));
    onEvent(event("tool.started", { tool: "openai.responses" }));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: context.abortSignal,
      body: JSON.stringify({
        model,
        input: withYoloInstruction(context.prompt),
        ...(context.continueSessionId ? { previous_response_id: context.continueSessionId } : {}),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${message}`);
    }

    const payload = (await response.json()) as {
      id?: string;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    onEvent(event("tool.finished", { tool: "openai.responses", ok: true }));

    const tokenInput = payload.usage?.input_tokens ?? 0;
    const tokenOutput = payload.usage?.output_tokens ?? 0;
    const rawSummary = (payload.output_text ?? "").trim() || "OpenAI run completed with empty output.";
    const summary = toCompactSummary(rawSummary);
    onEvent(event("llm.usage", { model, input: tokenInput, output: tokenOutput }));
    onEvent(event("run.completed", { result: summary }));

    return {
      summary,
      sessionId: payload.id ?? null,
      tokenInput,
      tokenOutput,
      costUsd: 0,
    };
  }
}

class AnthropicAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
    throwIfAborted(context.abortSignal);
    const apiKey = context.providerConfig?.apiKey;
    if (!apiKey) {
      throw new Error("Anthropic API key missing. Configure provider profile or set ANTHROPIC_API_KEY.");
    }

    const model = context.providerConfig?.model ?? "claude-3-7-sonnet-latest";
    const maxTokens = context.providerConfig?.maxTokens ?? 1200;
    onEvent(event("run.started", { provider: "claude-api", model, profile: context.providerConfig?.profileName }));
    onEvent(event("tool.started", { tool: "anthropic.messages" }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: context.abortSignal,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: withYoloInstruction(context.prompt) }],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${message}`);
    }

    const payload = (await response.json()) as {
      id?: string;
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    onEvent(event("tool.finished", { tool: "anthropic.messages", ok: true }));

    const rawSummary =
      payload.content?.filter((chunk) => chunk.type === "text").map((chunk) => chunk.text ?? "").join("\n").trim() ||
      "Anthropic run completed with empty output.";
    const summary = toCompactSummary(rawSummary);
    const tokenInput = payload.usage?.input_tokens ?? 0;
    const tokenOutput = payload.usage?.output_tokens ?? 0;

    onEvent(event("llm.usage", { model, input: tokenInput, output: tokenOutput }));
    onEvent(event("run.completed", { result: summary }));
    return {
      summary,
      sessionId: payload.id ?? null,
      tokenInput,
      tokenOutput,
      costUsd: 0,
    };
  }
}

class CommandAgentAdapter implements AgentAdapter {
  constructor(private readonly providerName: string) {}

  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
    throwIfAborted(context.abortSignal);
    const command = context.providerConfig?.command ?? this.providerName;
    const templateArgs = context.providerConfig?.args ?? [];
    const isContinue = Boolean(context.continueSessionId);

    let args: string[];
    if (isContinue) {
      args = this.buildContinueArgs(context.continueSessionId!, context.prompt);
    } else {
      args = templateArgs.map((arg) =>
        arg.replaceAll("{prompt}", context.prompt).replaceAll("{workspacePath}", context.workspacePath)
      );
    }

    const includePromptInStdin = !isContinue && !templateArgs.some((arg) => arg.includes("{prompt}"));
    const timeoutMs = context.providerConfig?.timeoutMs ?? 10 * 60 * 1000;
    const startedAt = Date.now();
    const devDebug = process.env.NODE_ENV !== "production";

    onEvent(
      event("run.started", {
        provider: this.providerName,
        command,
        profile: context.providerConfig?.profileName,
        mode: "yolo",
        continue: isContinue,
        continueSessionId: context.continueSessionId ?? null,
      })
    );
    onEvent(
      event("tool.started", {
        tool: "cli.exec",
        provider: this.providerName,
        ...(devDebug
          ? { command, args, cwd: context.workspacePath, timeoutMs, includePromptInStdin }
          : {}),
      })
    );

    const proc = Bun.spawn([command, ...args], {
      cwd: context.workspacePath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        SILO_PROMPT: context.prompt,
        SILO_WORKSPACE_ID: context.workspaceId,
        SILO_WORKSPACE_PATH: context.workspacePath,
        SILO_APPROVAL_POLICY: "never",
        SILO_YOLO_MODE: "1",
        CI: process.env.CI ?? "1",
      },
    });

    if (includePromptInStdin) {
      proc.stdin.write(context.prompt);
    }
    proc.stdin.end();

    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const timeout = Bun.sleep(timeoutMs).then(() => "timeout" as const);
    let cleanupAbort = () => {};
    const aborted = new Promise<"aborted">((resolve) => {
      const signal = context.abortSignal;
      if (!signal) {
        return;
      }

      const onAbort = () => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        resolve("aborted");
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });
      cleanupAbort = () => signal.removeEventListener("abort", onAbort);
    });

    const exitOrTimeout = await Promise.race([proc.exited.then(() => "exit" as const), timeout, aborted]);
    cleanupAbort();

    if (exitOrTimeout === "timeout") {
      try {
        proc.kill();
      } catch {
        // ignore
      }
      throw new Error(`${this.providerName} CLI timed out after ${timeoutMs}ms`);
    }

    if (exitOrTimeout === "aborted") {
      throw new Error("Run cancelled");
    }

    const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);

    if (exitCode !== 0) {
      throw new Error(`${this.providerName} CLI exited with ${exitCode}: ${stderr.trim() || stdout.trim()}`);
    }

    const providerError = this.extractProviderError(stdout, stderr);
    if (providerError) {
      throw new Error(providerError);
    }

    const rawSummary = this.buildSummary(stdout, stderr);
    const summary = toCompactSummary(rawSummary);
    const sessionId = this.extractSessionId(stdout, stderr);

    onEvent(
      event("tool.finished", {
        tool: "cli.exec",
        provider: this.providerName,
        ok: true,
        sessionId,
        ...(devDebug
          ? {
              exitCode,
              durationMs: Date.now() - startedAt,
              stdoutPreview: this.buildStdoutPreview(stdout, summary),
              stderrPreview: clip(stderr),
            }
          : {}),
      })
    );
    onEvent(event("run.completed", { result: summary, sessionId }));
    return {
      summary,
      sessionId,
      tokenInput: 0,
      tokenOutput: 0,
      costUsd: 0,
    };
  }

  private buildContinueArgs(sessionId: string, prompt: string): string[] {
    const name = this.providerName.toLowerCase();

    if (name === "claude") {
      return [
        "-p", prompt,
        "--resume", sessionId,
        "--allow-dangerously-skip-permissions",
        "--dangerously-skip-permissions",
        "--permission-mode", "bypassPermissions",
      ];
    }

    if (name === "opencode") {
      return [
        "run",
        "--session", sessionId,
        "--continue",
        "--format", "json",
        prompt,
      ];
    }

    if (name === "codex") {
      // codex doesn't have a clean session resume for exec, use fork
      return [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        prompt,
      ];
    }

    // generic fallback
    return [prompt];
  }

  private extractSessionId(stdout: string, stderr: string): string | null {
    const name = this.providerName.toLowerCase();

    if (name === "claude") {
      // claude outputs session id in stderr like: "Session: <uuid>"
      const match = stderr.match(/session[:\s]+([a-f0-9-]{36})/i)
        ?? stdout.match(/session[:\s]+([a-f0-9-]{36})/i);
      return match?.[1] ?? null;
    }

    if (name === "opencode") {
      // opencode JSON output includes sessionID
      const match = stdout.match(/"sessionID"\s*:\s*"([^"]+)"/);
      return match?.[1] ?? null;
    }

    if (name === "codex") {
      // codex may output session info
      const match = stdout.match(/session[:\s]+([a-zA-Z0-9_-]+)/i)
        ?? stderr.match(/session[:\s]+([a-zA-Z0-9_-]+)/i);
      return match?.[1] ?? null;
    }

    return null;
  }

  private buildSummary(stdout: string, stderr: string): string {
    const name = this.providerName.toLowerCase();

    if (name === "opencode") {
      const parsed = this.parseOpencodeSummary(stdout);
      if (parsed) {
        return parsed;
      }
      return "opencode run completed.";
    }

    return stdout.trim() || stderr.trim() || `${this.providerName} CLI run completed with empty output.`;
  }

  private buildStdoutPreview(stdout: string, summary: string): string {
    const name = this.providerName.toLowerCase();
    if (name === "opencode") {
      return summary;
    }
    return clip(stdout);
  }

  private extractProviderError(stdout: string, stderr: string): string | null {
    const name = this.providerName.toLowerCase();
    if (name !== "opencode") {
      return null;
    }

    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      try {
        const parsed = parseJsonLike(line);
        if (!parsed || typeof parsed !== "object") {
          continue;
        }

        const payload = parsed as Record<string, unknown>;
        if (payload.type === "error") {
          const errorObj = payload.error as Record<string, unknown> | undefined;
          const dataObj = errorObj?.data as Record<string, unknown> | undefined;
          const metadataObj = dataObj?.metadata as Record<string, unknown> | undefined;

          let nestedBodyMessage: string | null = null;
          if (typeof dataObj?.responseBody === "string") {
            try {
              const parsedBody = JSON.parse(dataObj.responseBody) as {
                error?: { message?: string };
              };
              nestedBodyMessage = parsedBody.error?.message ?? null;
            } catch {
              nestedBodyMessage = null;
            }
          }

          const message =
            nestedBodyMessage
            || (typeof dataObj?.message === "string" && dataObj.message)
            || (typeof metadataObj?.url === "string" && `request failed for ${metadataObj.url}`)
            || (typeof errorObj?.message === "string" && errorObj.message)
            || (typeof payload.message === "string" && payload.message)
            || "opencode returned an error";
          return `opencode error: ${message}`;
        }
      } catch {
        // ignore non-JSON lines
      }
    }

    const raw = `${stdout}\n${stderr}`;
    if (/"type"\s*:\s*"error"/i.test(raw) || /\\"type\\"\s*:\s*\\"error\\"/i.test(raw)) {
      const userNotFound = /user not found/i.test(raw);
      if (userNotFound) {
        return "opencode error: User not found. Re-authenticate opencode/OpenRouter credentials, then retry continue.";
      }
      return `opencode error: ${clip(raw, 280)}`;
    }

    if (stderr.trim()) {
      return `opencode error: ${stderr.trim()}`;
    }

    return null;
  }

  private parseOpencodeSummary(stdout: string): string | null {
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const textChunks: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.type !== "text") {
          continue;
        }

        const part = parsed.part as Record<string, unknown> | undefined;
        const textValue =
          (typeof part?.text === "string" && part.text)
          || (typeof parsed.text === "string" && parsed.text)
          || null;

        if (textValue) {
          const cleaned = textValue.trim();
          if (cleaned) {
            textChunks.push(cleaned);
          }
        }
      } catch {
        // ignore non-JSON lines
      }
    }

    if (textChunks.length === 0) {
      return null;
    }

    return textChunks[textChunks.length - 1];
  }
}

function parseJsonLike(input: string): unknown {
  try {
    const first = JSON.parse(input) as unknown;
    if (typeof first === "string") {
      try {
        return JSON.parse(first) as unknown;
      } catch {
        return first;
      }
    }
    return first;
  } catch {
    return null;
  }
}

export function getAdapter(provider: string): AgentAdapter {
  const normalized = provider.toLowerCase();

  if (normalized === "openai") {
    return new OpenAIAdapter();
  }

  if (normalized === "claude-api" || normalized === "anthropic") {
    return new AnthropicAdapter();
  }

  if (normalized === "codex") {
    return new CommandAgentAdapter("codex");
  }

  if (normalized === "claude") {
    return new CommandAgentAdapter("claude");
  }

  if (normalized === "opencode") {
    return new CommandAgentAdapter("opencode");
  }

  if (normalized === "mock") {
    return new MockAgentAdapter();
  }

  throw new Error(
    `Unknown provider '${provider}'. Use one of: mock, openai, claude-api, codex, claude, opencode.`
  );
}

function event(type: EventType, payload: Record<string, unknown>): AgentEvent {
  return {
    id: newId("adapterevt"),
    ts: nowIso(),
    type,
    payload,
  };
}

function withYoloInstruction(prompt: string): string {
  return [
    "Execution policy: YOLO mode is enabled.",
    "Do not ask for permission, confirmation, or approval.",
    "Act directly, make safe reasonable assumptions, and complete the task end-to-end.",
    "If something cannot be done, explain the blocker and continue with remaining work.",
    "",
    prompt,
  ].join("\n");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Run cancelled");
  }
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (!signal) {
    await Bun.sleep(ms);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Run cancelled"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function clip(value: string, size = 1800): string {
  const trimmed = value.trim();
  if (trimmed.length <= size) return trimmed;
  return `${trimmed.slice(0, size)}...`;
}

function toCompactSummary(input: string): string {
  const normalized = input.replace(/\r/g, "\n").trim();
  if (!normalized) {
    return "Run completed.";
  }

  if (normalized.length <= 260 && !normalized.includes("\n\n")) {
    return normalized;
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^session\s*:/i.test(line));

  const bulletCandidates = lines
    .filter((line) => /^(-|\*|•|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^(-|\*|•|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => clip(line, 200));

  if (bulletCandidates.length > 0) {
    return bulletCandidates.map((line) => `- ${line}`).join("\n");
  }

  const sentenceSource = lines.join(" ").replace(/\s+/g, " ").trim();
  const sentences = sentenceSource
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((sentence) => clip(sentence, 220));

  if (sentences.length > 1) {
    return sentences.map((sentence) => `- ${sentence}`).join("\n");
  }

  return clip(sentenceSource, 420);
}
