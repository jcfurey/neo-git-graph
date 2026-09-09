import path from "node:path";

import type { SimpleGit } from "simple-git";

import { runHistoryAction } from "@/backend/actions/history";
import {
  interactiveRebase,
  rebaseBranch,
  requireIdle,
  withRecoveryEditor
} from "@/backend/actions/rebase";
import { manageRemote } from "@/backend/actions/remotes";
import { loadOperation, loadStashes, loadWorktrees } from "@/backend/queries/repository";
import type { RepositoryAction, StashDetails } from "@/backend/types";
import { normalizeRepoPath } from "@/backend/utils/repoPath";
import { runGit } from "@/backend/utils/runGit";
import { requireBranchName, resolveCommit } from "@/backend/utils/validation";

export type RepositoryEffect =
  | { kind: "worktree" | "conflict"; path: string }
  | { kind: "document"; text: string }
  | { kind: "diff"; left: string | null; right: string | null; before: string; after: string }
  | { kind: "historicalFile"; hash: string; path: string }
  | { kind: "restoreDiff"; hash: string; sourcePath: string; destination: string; exists: boolean }
  | void;

async function findStash(git: SimpleGit, stash: StashDetails) {
  const stashes = await loadStashes(git);
  const exact = stashes.find((item) => item.ref === stash.ref && item.hash === stash.hash);
  if (exact !== undefined) {
    return exact;
  }
  const matches = stashes.filter((item) => item.hash === stash.hash);
  if (matches.length !== 1) {
    throw new Error("The stash list changed. Reload it before continuing.");
  }
  return matches[0]!;
}

export async function runRepositoryAction(
  git: SimpleGit,
  action: RepositoryAction,
  binary = "git"
): Promise<RepositoryEffect> {
  switch (action.kind) {
    case "submodule":
    case "restoreFile":
    case "previewFileRestore":
    case "fixup":
    case "batch":
    case "recoverBranch":
    case "viewRangeFile":
    case "viewHistoricalFile":
      return runHistoryAction(git, action, binary);
    case "addRemote":
    case "editRemote":
    case "renameRemote":
    case "removeRemote":
    case "pushDefault":
    case "setTracking":
    case "deleteRemoteRef":
      return manageRemote(git, action);
    case "saveStash":
      await requireIdle(git);
      await git.raw([
        "stash",
        "push",
        ...(action.includeUntracked ? ["--include-untracked"] : []),
        "--message",
        action.message || "Git Graph stash"
      ]);
      return;
    case "stash": {
      const stash = await findStash(git, action.stash);
      if (action.operation === "inspect") {
        return {
          kind: "document",
          text: await git.raw([
            "stash",
            "show",
            "--patch",
            "--include-untracked",
            "--no-ext-diff",
            "--no-textconv",
            stash.hash
          ])
        };
      }
      if (action.operation !== "drop") {
        await requireIdle(git);
        await runGit(
          git,
          ["stash", "apply", ...(action.reinstateIndex ? ["--index"] : []), stash.hash],
          binary
        );
      }
      // A conflicting pop leaves the stash intact. Resolve its selector again
      // after apply, since another Git client may have pushed a newer stash.
      if (action.operation === "drop" || action.operation === "pop") {
        await git.raw(["stash", "drop", (await findStash(git, stash)).ref]);
      }
      return;
    }
    case "rebase":
      return rebaseBranch(git, action.branch, action.onto, action.expectedHead, binary);
    case "interactiveRebase":
      return interactiveRebase(git, action.plan, binary);
    case "recover": {
      const current = await loadOperation(git);
      if (
        current === null ||
        current.id !== action.operation.id ||
        current.kind !== action.operation.kind
      ) {
        throw new Error("The operation changed. Refresh its status before continuing.");
      }
      if (action.resolution === "skip" && current.kind === "merge") {
        throw new Error("A merge cannot be skipped. Continue or abort it.");
      }
      if (action.resolution === "continue" && (await git.status()).conflicted.length > 0) {
        throw new Error("Resolve and stage the conflicted files before continuing.");
      }
      await withRecoveryEditor(git, [current.kind, `--${action.resolution}`], binary);
      return;
    }
    case "conflict": {
      if (!(await git.status()).conflicted.includes(action.path)) {
        throw new Error("This file is no longer conflicted. Refresh the graph.");
      }
      if (action.operation === "stage") {
        await git.raw(["add", "--", action.path]);
        return;
      }
      const root = (await git.revparse(["--show-toplevel"])).trim();
      return { kind: "conflict", path: path.join(root, action.path) };
    }
    case "addWorktree": {
      if (!path.isAbsolute(action.path)) {
        throw new Error("Enter an absolute folder path for the worktree.");
      }
      await requireBranchName(git, action.branch);
      const start = action.newBranch ? await resolveCommit(git, action.startPoint) : action.branch;
      await git.raw([
        "worktree",
        "add",
        ...(action.newBranch ? ["--no-track", "-b", action.branch] : []),
        "--",
        action.path,
        start
      ]);
      return;
    }
    case "openWorktree":
    case "removeWorktree": {
      const worktrees = await loadWorktrees(git);
      const worktree = worktrees.find((entry) => entry.path === normalizeRepoPath(action.path));
      if (worktree === undefined || worktree.bare || worktree.prunable) {
        throw new Error("This worktree is no longer available. Refresh the worktree list.");
      }
      if (action.kind === "openWorktree") {
        return { kind: "worktree", path: worktree.path };
      }
      const current = normalizeRepoPath((await git.revparse(["--show-toplevel"])).trim());
      if (worktree.path === current || worktrees[0]?.path === worktree.path) {
        throw new Error("The current or main worktree cannot be removed here.");
      }
      if (worktree.head !== action.expectedHead) {
        throw new Error("The worktree changed. Inspect it before removing it.");
      }
      await git.raw(["worktree", "remove", "--", worktree.path]);
      return;
    }
  }
}
