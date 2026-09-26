import { signal } from "@preact/signals";

import type { GitRepo } from "@/types";
import { rpcClient } from "@/webview/lib/rpc/rpc-client";

const repoList = signal<Array<GitRepo> | undefined>(undefined);

export const repoListStore = {
  get: (): Array<GitRepo> | undefined => {
    return repoList.value;
  },
  /** Scan again. The current list stays on screen until the new one arrives. */
  load: async (): Promise<Array<GitRepo>> => {
    const result = await rpcClient.request("repo.scan", null);
    repoList.value = result.repos;
    return result.repos;
  },
  /** Offer a repository that the extension selected, such as one clicked in Source Control. */
  add: (repo: GitRepo): void => {
    repoList.value = [
      ...(repoList.value ?? []).filter((entry) => entry.path !== repo.path),
      repo
    ].toSorted((a, b) => a.path.localeCompare(b.path));
  }
};
