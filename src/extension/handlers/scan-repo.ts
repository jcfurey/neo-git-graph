import path from "node:path";

import { extConfig } from "@/extension/config";
import { logger } from "@/extension/util/logger";
import { listRepos } from "@/extension/workspace-scan";
import type { ScanRepoResult } from "@/types";

export async function scanRepos(): Promise<ScanRepoResult> {
  const gitBinary = extConfig.gitPath();
  const repos = await listRepos(gitBinary, extConfig.maxDepthOfRepoSearch());
  logger.info(`Repository scan completed: ${repos.length} found; Git binary: ${gitBinary}`);
  return { repos: repos.map((repo) => ({ name: path.basename(repo), path: repo })) };
}
