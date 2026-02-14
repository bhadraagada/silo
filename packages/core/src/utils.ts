const slugSafeRegex = /[^a-z0-9-]+/g;

export function nowIso(): string {
  return new Date().toISOString();
}

export function toSafeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(slugSafeRegex, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function makeWorkspaceSlug(projectSlug: string, task: string): string {
  const left = toSafeSlug(projectSlug);
  const right = toSafeSlug(task);
  return `${left}-${right}`;
}

export function makeBranch(task: string): string {
  return `silo/${toSafeSlug(task)}`;
}

export function hashToPort(seed: string, base = 20000, range = 20000): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return base + (hash % range);
}

export function makeDomain(workspaceSlug: string): string {
  return `${workspaceSlug}.dev.local`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
