import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SimpleGit } from "simple-git";

import type {
  OperationKind,
  OperationState,
  RebasePlan,
  RepositoryQuery,
  RepositoryQueryData,
  RepositoryState,
  StashDetails,
  WorktreeDetails
} from "@/backend/types";
import { normalizeRepoPath } from "@/backend/utils/repoPath";
import { requireRemote, resolveCommit } from "@/backend/utils/validation";

export async function gitDirectory(git: SimpleGit) {
  return (await git.raw(["rev-parse", "--absolute-git-dir"])).replace(/\n$/, "");
}

export async function readOptional(filename: string) {
  try {
    return await readFile(filename, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function loadOperation(git: SimpleGit): Promise<OperationState | null> {
  const directory = await gitDirectory(git);
  const files = [
    "rebase-merge/head-name",
    "rebase-apply/head-name",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "sequencer/todo"
  ];
  const contents = await Promise.all(files.map((file) => readOptional(path.join(directory, file))));
  let kind: OperationKind | undefined;
  if (contents[0] !== null || contents[1] !== null) {
    kind = "rebase";
  } else if (contents[2] !== null) {
    kind = "merge";
  } else if (contents[3] !== null || contents[5]?.startsWith("pick ")) {
    kind = "cherry-pick";
  } else if (contents[4] !== null || contents[5]?.startsWith("revert ")) {
    kind = "revert";
  }
  if (kind === undefined) {
    return null;
  }
  const head = await resolveCommit(git, "HEAD");
  return {
    kind,
    id: createHash("sha256")
      .update(JSON.stringify([kind, head, contents]))
      .digest("hex")
  };
}

export async function loadWorktrees(git: SimpleGit): Promise<WorktreeDetails[]> {
  const text = await git.raw(["worktree", "list", "--porcelain", "-z"]);
  return text
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const fields = new Map(
        record.split("\0").map((line) => {
          const separator = line.indexOf(" ");
          return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
        })
      );
      return {
        path: normalizeRepoPath(fields.get("worktree") ?? ""),
        head: fields.get("HEAD") ?? "",
        branch: (fields.get("branch") ?? "").replace(/^refs\/heads\//, ""),
        bare: fields.has("bare"),
        locked: fields.has("locked"),
        prunable: fields.has("prunable")
      };
    });
}

export async function loadRepositoryState(git: SimpleGit): Promise<RepositoryState> {
  const [remotes, pushDefault, branches, worktrees, status, operation] = await Promise.all([
    git.getRemotes(),
    git.getConfig("remote.pushDefault"),
    git.raw([
      "for-each-ref",
      "--format=%(refname:lstrip=2)%00%(upstream)%00%(upstream:track)",
      "refs/heads/"
    ]),
    loadWorktrees(git),
    git.status(),
    loadOperation(git)
  ]);
  return {
    remotes: await Promise.all(
      remotes.map(async ({ name }) => ({
        name,
        fetchUrls: (await git.getConfig(`remote.${name}.url`)).values,
        pushUrls: (await git.getConfig(`remote.${name}.pushurl`)).values
      }))
    ),
    pushDefault: pushDefault.value,
    branches: branches
      .trimEnd()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name = "", upstream = "", tracking = ""] = line.split("\0");
        return {
          name,
          upstream: upstream.replace(/^refs\/(heads|remotes)\//, ""),
          ahead: Number(tracking.match(/ahead (\d+)/)?.[1] ?? 0),
          behind: Number(tracking.match(/behind (\d+)/)?.[1] ?? 0),
          gone: tracking === "[gone]"
        };
      }),
    remoteBranches: (
      await git.raw(["for-each-ref", "--format=%(refname:lstrip=2)%00%(symref)", "refs/remotes/"])
    )
      .trimEnd()
      .split("\n")
      .filter(Boolean)
      .filter((line) => line.split("\0")[1] === "")
      .map((line) => line.split("\0")[0]!),
    worktrees,
    head: status.detached ? "" : (status.current ?? ""),
    operation,
    conflicts: status.conflicted
  };
}

export async function loadStashes(git: SimpleGit): Promise<StashDetails[]> {
  const fields = (await git.raw(["stash", "list", "-z", "--format=%gd%x00%H%x00%gs"])).split("\0");
  const stashes: StashDetails[] = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    stashes.push({ ref: fields[index]!, hash: fields[index + 1]!, message: fields[index + 2]! });
  }
  return stashes;
}

export async function loadRebasePlan(git: SimpleGit, baseRef: string): Promise<RebasePlan> {
  const base = await resolveCommit(git, baseRef);
  const head = await resolveCommit(git, "HEAD");
  const branch = (await git.raw(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if ((await git.raw(["merge-base", base, head])).trim() !== base) {
    throw new Error("Choose an ancestor of the current branch for interactive rebase.");
  }
  const rows = (
    await git.raw(["rev-list", "--reverse", "--topo-order", "--parents", `${base}..${head}`])
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (rows.length === 0) {
    throw new Error("There are no commits after this commit on the current branch.");
  }
  if (rows.some((row) => row.split(" ").length > 2)) {
    throw new Error(
      "This range contains merge commits. Choose a linear range for interactive rebase, or use Rebase onto this branch to preserve merges."
    );
  }
  return {
    base,
    head,
    branch,
    entries: await Promise.all(
      rows.map(async (row) => {
        const hash = row.split(" ")[0]!;
        return {
          hash,
          action: "pick" as const,
          message: (await git.raw(["show", "-s", "--format=%B", hash])).trimEnd()
        };
      })
    )
  };
}

export async function repositoryQuery(
  git: SimpleGit,
  query: RepositoryQuery
): Promise<RepositoryQueryData> {
  switch (query.kind) {
    case "state":
      return { kind: "state", state: await loadRepositoryState(git) };
    case "stashes":
      return { kind: "stashes", stashes: await loadStashes(git) };
    case "rebasePlan":
      return { kind: "rebasePlan", plan: await loadRebasePlan(git, query.base) };
    case "lease": {
      await requireRemote(git, query.remote);
      const hash = await resolveCommit(git, `refs/remotes/${query.remote}/${query.branch}`);
      return { kind: "lease", hash };
    }
  }
}
