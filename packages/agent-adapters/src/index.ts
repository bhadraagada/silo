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
}

export interface RunContext {
  workspaceId: string;
  workspacePath: string;
  prompt: string;
  provider: string;
  providerConfig?: ProviderRuntimeConfig;
}

export interface RunResult {
  summary: string;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
}

export interface AgentAdapter {
  run(context: RunContext, onEvent: (event: AgentEvent) => void): Promise<RunResult>;
}

class MockAgentAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (event: AgentEvent) => void): Promise<RunResult> {
    onEvent(event("run.started", { provider: context.provider, prompt: context.prompt }));
    onEvent(event("tool.started", { tool: "analysis", step: "inspect workspace" }));
    await Bun.sleep(200);
    onEvent(event("tool.finished", { tool: "analysis", ok: true }));
    onEvent(event("llm.usage", { input: 280, output: 540, model: "mock" }));
    await Bun.sleep(300);
    onEvent(event("run.completed", { result: "Changes drafted and validated." }));
    return {
      summary: "Mock run completed: drafted and validated workspace changes.",
      tokenInput: 280,
      tokenOutput: 540,
      costUsd: 0,
    };
  }
}

class OpenAIAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
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
      body: JSON.stringify({
        model,
        input: context.prompt,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${message}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    onEvent(event("tool.finished", { tool: "openai.responses", ok: true }));

    const tokenInput = payload.usage?.input_tokens ?? 0;
    const tokenOutput = payload.usage?.output_tokens ?? 0;
    const summary = (payload.output_text ?? "").trim() || "OpenAI run completed with empty output.";
    onEvent(event("llm.usage", { model, input: tokenInput, output: tokenOutput }));
    onEvent(event("run.completed", { result: summary }));

    return { summary, tokenInput, tokenOutput, costUsd: 0 };
  }
}

class AnthropicAdapter implements AgentAdapter {
  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
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
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: context.prompt }],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${message}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    onEvent(event("tool.finished", { tool: "anthropic.messages", ok: true }));

    const summary =
      payload.content?.filter((chunk) => chunk.type === "text").map((chunk) => chunk.text ?? "").join("\n").trim() ||
      "Anthropic run completed with empty output.";
    const tokenInput = payload.usage?.input_tokens ?? 0;
    const tokenOutput = payload.usage?.output_tokens ?? 0;

    onEvent(event("llm.usage", { model, input: tokenInput, output: tokenOutput }));
    onEvent(event("run.completed", { result: summary }));
    return { summary, tokenInput, tokenOutput, costUsd: 0 };
  }
}

class CommandAgentAdapter implements AgentAdapter {
  constructor(private readonly providerName: string) {}

  async run(context: RunContext, onEvent: (eventObj: AgentEvent) => void): Promise<RunResult> {
    const command = context.providerConfig?.command ?? this.providerName;
    const args = context.providerConfig?.args ?? [];

    onEvent(event("run.started", { provider: this.providerName, command, profile: context.providerConfig?.profileName }));
    onEvent(event("tool.started", { tool: "cli.exec", provider: this.providerName }));

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
      },
    });

    proc.stdin.write(context.prompt);
    proc.stdin.end();

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`${this.providerName} CLI exited with ${exitCode}: ${stderr.trim() || stdout.trim()}`);
    }

    const summary = stdout.trim() || `${this.providerName} CLI run completed with empty stdout.`;
    onEvent(event("tool.finished", { tool: "cli.exec", provider: this.providerName, ok: true }));
    onEvent(event("run.completed", { result: summary }));
    return {
      summary,
      tokenInput: 0,
      tokenOutput: 0,
      costUsd: 0,
    };
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
