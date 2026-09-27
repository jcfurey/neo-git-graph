import { rm } from "node:fs/promises";
import * as path from "node:path";

import type { ExtensionContext, Memento } from "vscode";

import type { GitRepoSet } from "@/types";

const LAST_ACTIVE_REPO = "lastActiveRepo";
const REPO_STATES = "repoStates";

// Earlier versions cached commit author avatars here; nothing reads them any more.
const AVATAR_CACHE = "avatarCache";
const AVATAR_STORAGE_FOLDER = "avatars";

export class ExtensionState {
  private workspaceState: Memento;

  constructor(context: ExtensionContext) {
    this.workspaceState = context.workspaceState;

    if (context.globalState.get(AVATAR_CACHE) !== undefined) {
      void context.globalState.update(AVATAR_CACHE, undefined);
    }
    rm(path.join(context.globalStoragePath, AVATAR_STORAGE_FOLDER), {
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

  /* Last Active Repo */
  public getLastActiveRepo() {
    return this.workspaceState.get<string | null>(LAST_ACTIVE_REPO, null);
  }
  public setLastActiveRepo(repo: string | null) {
    this.workspaceState.update(LAST_ACTIVE_REPO, repo);
  }
}
