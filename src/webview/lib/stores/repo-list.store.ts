import { signal } from "@preact/signals";

import type { GitRepo, RepoChange } from "@/types";
import { rpcClient } from "@/webview/lib/rpc/rpc-client";

const repoList = signal<Array<GitRepo> | undefined>(undefined);

export const repoListStore = {
  get: (): Array<GitRepo> | undefined => {
    return repoList.value;
  },
  // A rescan keeps the current list on screen until the new one arrives.
  load: async (): Promise<Array<GitRepo>> => {
    const result = await rpcClient.request("repo.scan", null);
    repoList.value = result.repos;
    return result.repos;
  },
  apply: (change: RepoChange): void => {
    const repos = repoList.value ?? [];

    if (change.type === "created") {
      repoList.value = [
        ...repos.filter((repo) => repo.path !== change.repo.path),
        change.repo
      ].toSorted((a, b) => a.path.localeCompare(b.path));
      return;
    }

    repoList.value = repos.filter((repo) => repo.path !== change.path);
  }
};
