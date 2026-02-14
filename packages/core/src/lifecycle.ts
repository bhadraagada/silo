import type { UpWorkspaceInput, Workspace } from "./types";
import { hashToPort, makeBranch, makeDomain, makeWorkspaceSlug, nowIso, toSafeSlug } from "./utils";

export interface WorkspaceSeed {
  slug: string;
  branch: string;
  domain: string;
  appPort: number;
  apiPort: number;
  profileDirName: string;
}

export function createWorkspaceSeed(input: UpWorkspaceInput): WorkspaceSeed {
  const projectSlug = toSafeSlug(input.projectSlug);
  const taskSlug = toSafeSlug(input.task);
  const slug = makeWorkspaceSlug(projectSlug, taskSlug);
  const appPort = hashToPort(`${slug}:app`);
  const apiPort = hashToPort(`${slug}:api`);

  return {
    slug,
    branch: makeBranch(taskSlug),
    domain: makeDomain(slug),
    appPort,
    apiPort,
    profileDirName: slug,
  };
}

export function touchWorkspace(workspace: Workspace, status: Workspace["status"]): Workspace {
  return {
    ...workspace,
    status,
    updatedAt: nowIso(),
  };
}
