import type { AgentRun } from "@silo/core";
import type { ReviewSnapshot } from "@silo/git";
import type { ResolvedProviderConfig } from "./provider-profiles";

export interface ReviewIntel {
  riskHotspots: string[];
  likelyRegressions: string[];
  testRecommendations: string[];
  commitMessageDraft: string;
  prTitleDraft: string;
  prBodyDraft: string;
  source: "heuristic" | "llm";
}

export async function generateReviewIntel(input: {
  snapshot: ReviewSnapshot;
  recentRuns: AgentRun[];
  provider?: string;
  providerConfig?: ResolvedProviderConfig;
}): Promise<ReviewIntel> {
  const heuristic = heuristicIntel(input.snapshot, input.recentRuns);
  if (!input.provider || !input.providerConfig) {
    return { ...heuristic, source: "heuristic" };
  }

  try {
    if (input.provider === "openai" && input.providerConfig.apiKey) {
      const llm = await llmIntelOpenAI(heuristic, input.snapshot, input.providerConfig);
      return { ...llm, source: "llm" };
    }
    if ((input.provider === "claude-api" || input.provider === "anthropic") && input.providerConfig.apiKey) {
      const llm = await llmIntelAnthropic(heuristic, input.snapshot, input.providerConfig);
      return { ...llm, source: "llm" };
    }
  } catch {
    // fallback to heuristic when model call fails
  }

  return { ...heuristic, source: "heuristic" };
}

function heuristicIntel(snapshot: ReviewSnapshot, recentRuns: AgentRun[]): Omit<ReviewIntel, "source"> {
  const files = snapshot.changedFiles;
  const failedRecentRun = recentRuns.find((run) => run.status === "failed");
  const isFrontend = files.some((file) => /\.(tsx?|jsx?|css|scss)$/.test(file));
  const isBackend = files.some((file) => /(server|api|route|handler|db|schema|migration)/i.test(file));
  const touchesAuth = files.some((file) => /(auth|oauth|session|cookie|token)/i.test(file));
  const touchesConfig = files.some((file) => /(package\.json|lock|config|\.env|gateway|caddy|traefik)/i.test(file));

  const riskHotspots = [
    ...topFileRisks(files),
    ...(touchesAuth ? ["Auth/session paths changed; validate login, logout, and callback redirects."] : []),
    ...(touchesConfig ? ["Config or infrastructure files changed; verify local boot and CI behavior."] : []),
  ].slice(0, 6);

  const likelyRegressions = [
    ...(isFrontend ? ["UI rendering or client-side state regressions on updated screens."] : []),
    ...(isBackend ? ["API contract mismatches and runtime validation errors in touched handlers."] : []),
    ...(failedRecentRun ? [`Recent run failed (${failedRecentRun.provider}); inspect failure context before shipping.`] : []),
    "Edge cases around changed code paths with sparse tests.",
  ].slice(0, 6);

  const testRecommendations = [
    ...(isFrontend ? ["Run focused UI smoke tests on changed pages/components."] : []),
    ...(isBackend ? ["Run API integration tests for modified endpoints and schema paths."] : []),
    ...(touchesAuth ? ["Run end-to-end sign-in redirect and token refresh tests."] : []),
    "Run full typecheck, test, and build before ship.",
  ].slice(0, 6);

  const scope = files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""}` : "workspace changes";
  const commitMessageDraft = `update ${scope} to improve workflow stability and keep workspace behavior deterministic`;
  const prTitleDraft = `Update ${scope} for safer workspace lifecycle`;
  const prBodyDraft = [
    "## Summary",
    `- Update ${scope} across the workspace lifecycle and runtime flow.`,
    "- Improve reliability and traceability for local agent workflows.",
    "",
    "## Validation",
    "- Run typecheck, tests, and build",
    "- Verify changed paths manually in the target workspace",
  ].join("\n");

  return {
    riskHotspots,
    likelyRegressions,
    testRecommendations,
    commitMessageDraft,
    prTitleDraft,
    prBodyDraft,
  };
}

function topFileRisks(files: string[]): string[] {
  return files.slice(0, 4).map((file) => `Changed file: ${file}`);
}

async function llmIntelOpenAI(
  fallback: Omit<ReviewIntel, "source">,
  snapshot: ReviewSnapshot,
  config: ResolvedProviderConfig
): Promise<Omit<ReviewIntel, "source">> {
  const model = config.model ?? "gpt-4.1-mini";
  const prompt = buildIntelPrompt(snapshot, fallback);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI intel request failed (${response.status})`);
  }

  const payload = (await response.json()) as { output_text?: string };
  return parseIntelJson(payload.output_text ?? "", fallback);
}

async function llmIntelAnthropic(
  fallback: Omit<ReviewIntel, "source">,
  snapshot: ReviewSnapshot,
  config: ResolvedProviderConfig
): Promise<Omit<ReviewIntel, "source">> {
  const model = config.model ?? "claude-3-7-sonnet-latest";
  const prompt = buildIntelPrompt(snapshot, fallback);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: config.maxTokens ?? 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic intel request failed (${response.status})`);
  }

  const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = payload.content?.find((entry) => entry.type === "text")?.text ?? "";
  return parseIntelJson(text, fallback);
}

function buildIntelPrompt(snapshot: ReviewSnapshot, fallback: Omit<ReviewIntel, "source">): string {
  return [
    "You are a senior code reviewer.",
    "Return strict JSON with keys:",
    "riskHotspots (string[]), likelyRegressions (string[]), testRecommendations (string[]),",
    "commitMessageDraft (string), prTitleDraft (string), prBodyDraft (string).",
    "Keep each list <= 6 items.",
    "",
    "Changed files:",
    snapshot.changedFiles.join("\n") || "<none>",
    "",
    "Status porcelain:",
    snapshot.statusPorcelain,
    "",
    "Diff excerpt:",
    snapshot.diff.slice(0, 9000),
    "",
    "Fallback context:",
    JSON.stringify(fallback),
  ].join("\n");
}

function parseIntelJson(raw: string, fallback: Omit<ReviewIntel, "source">): Omit<ReviewIntel, "source"> {
  try {
    const parsed = JSON.parse(raw) as Partial<Omit<ReviewIntel, "source">>;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return {
      riskHotspots: arrayOr(parsed.riskHotspots, fallback.riskHotspots),
      likelyRegressions: arrayOr(parsed.likelyRegressions, fallback.likelyRegressions),
      testRecommendations: arrayOr(parsed.testRecommendations, fallback.testRecommendations),
      commitMessageDraft:
        typeof parsed.commitMessageDraft === "string" ? parsed.commitMessageDraft : fallback.commitMessageDraft,
      prTitleDraft: typeof parsed.prTitleDraft === "string" ? parsed.prTitleDraft : fallback.prTitleDraft,
      prBodyDraft: typeof parsed.prBodyDraft === "string" ? parsed.prBodyDraft : fallback.prBodyDraft,
    };
  } catch {
    return fallback;
  }
}

function arrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const safe = value.filter((item) => typeof item === "string") as string[];
  return safe.length ? safe.slice(0, 6) : fallback;
}
