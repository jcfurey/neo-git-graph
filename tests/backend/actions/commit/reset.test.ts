import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { resetToCommit } from "@/backend/actions/commit";
import { createGit } from "@/backend/gitClient";
import type { GitResetMode } from "@/backend/types";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

// The first commit has f = "x"; the second, checked out, has f = "y".
const repo = freshRepo((dir) => {
  fs.writeFileSync(path.join(dir, "f"), "y");
  git(["commit", "-am", "second"], dir);
});

async function reset(resetMode: GitResetMode) {
  const first = gitOutput(["rev-parse", "HEAD^"], repo());
  await resetToCommit(createGit(repo(), "git"), { commitHash: first, resetMode });
  return {
    moved: gitOutput(["rev-parse", "HEAD"], repo()) === first,
    index: gitOutput(["show", ":f"], repo()),
    worktree: fs.readFileSync(path.join(repo(), "f"), "utf8")
  };
}

describe("resetToCommit", () => {
  // Each mode keeps a different part of the newer commit.
  it("soft-resets HEAD and keeps the index and working tree", async () => {
    expect(await reset("soft")).toEqual({ moved: true, index: "y", worktree: "y" });
  });

  it("mixed-resets HEAD and the index and keeps the working tree", async () => {
    expect(await reset("mixed")).toEqual({ moved: true, index: "x", worktree: "y" });
  });

  it("hard-resets HEAD, the index, and the working tree", async () => {
    expect(await reset("hard")).toEqual({ moved: true, index: "x", worktree: "x" });
  });

  it("throws for an unknown commit and leaves HEAD in place", async () => {
    const head = gitOutput(["rev-parse", "HEAD"], repo());
    await expect(
      resetToCommit(createGit(repo(), "git"), { commitHash: "0".repeat(40), resetMode: "hard" })
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "HEAD"], repo())).toBe(head);
  });
});
