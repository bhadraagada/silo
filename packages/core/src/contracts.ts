import { z } from "zod";

export const upWorkspaceSchema = z.object({
  projectSlug: z.string().min(1),
  task: z.string().min(1),
  repoPath: z.string().optional(),
});

export const runWorkspaceSchema = z.object({
  workspaceSlug: z.string().min(1),
  provider: z.string().default("mock"),
  prompt: z.string().min(1),
  profile: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  continueRunId: z.string().min(1).optional(),
});

export const notifySchema = z.object({
  title: z.string(),
  body: z.string(),
  action: z.string(),
});

export const reviewWorkspaceSchema = z.object({
  workspaceSlug: z.string().min(1),
});

export const shipWorkspaceSchema = z.object({
  workspaceSlug: z.string().min(1),
  commitMessage: z.string().min(1),
  runChecks: z.boolean().default(true),
  openPr: z.boolean().default(false),
  checks: z.array(z.string()).optional(),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
});

export const providerDefaultSchema = z.object({
  profile: z.string().min(1),
});

export const providerSetSchema = z.object({
  profile: z.string().min(1),
  provider: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

export const providerValidateSchema = z.object({
  profile: z.string().min(1).optional(),
});

export const queueConfigSchema = z.object({
  maxConcurrentRuns: z.number().int().min(1).max(20).optional(),
  maxExpensiveRuns: z.number().int().min(1).max(20).optional(),
  maxWorkspaceRuns: z.number().int().min(1).max(20).optional(),
  starvationThresholdMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
});

export const queueWorkspaceSchema = z.object({
  workspaceSlug: z.string().min(1),
});

export const actionExecuteSchema = z.object({
  action: z.string().min(1),
});
