import { rm } from "node:fs/promises";
import path from "node:path";

import type { ExtensionContext, Memento } from "vscode";

import type { GitRepoSet } from "@/types";

const REPO_STATES = "repoStates";
const AVATAR_CACHE = "avatarCache";

export class ExtensionState {
  private workspaceState: Memento;

  constructor(context: ExtensionContext) {
    this.workspaceState = context.workspaceState;
    // Earlier versions cached commit author avatars, which nothing shows any more.
    if (context.globalState.get(AVATAR_CACHE) !== undefined) {
      void context.globalState.update(AVATAR_CACHE, undefined);
    }
    void rm(path.join(context.globalStoragePath, "avatars"), {
      recursive: true,
      force: true
    }).catch(() => {});
  }

  /* Discovered Repos */
  public getRepos() {
    return this.workspaceState.get<GitRepoSet>(REPO_STATES, {});
  }
  public saveRepos(gitRepoSet: GitRepoSet) {
    this.workspaceState.update(REPO_STATES, gitRepoSet);
  }
}
