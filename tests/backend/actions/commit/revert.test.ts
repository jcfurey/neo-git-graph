import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { describe, expect, it } from "vitest";

import { revertCommit } from "@/backend/actions/commit";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => {
  fs.writeFileSync(path.join(dir, "g"), "revert-me");
  git(["add", "g"], dir);
  git(["commit", "-m", "second commit"], dir);
});

describe("revertCommit", () => {
  it("adds a commit that undoes the reverted one", async () => {
    const reverted = gitOutput(["rev-parse", "HEAD"], repo());
    await revertCommit(simpleGit(repo()), { commitHash: reverted, parentIndex: 0 });
    expect(gitOutput(["rev-parse", "HEAD^"], repo())).toBe(reverted);
    expect(fs.existsSync(path.join(repo(), "g"))).toBe(false);
    expect(gitOutput(["status", "--porcelain"], repo())).toBe("");
  });

  it("throws for a nonexistent commit and leaves the branch unchanged", async () => {
    const head = gitOutput(["rev-parse", "HEAD"], repo());
    await expect(
      revertCommit(simpleGit(repo()), { commitHash: "0".repeat(40), parentIndex: 0 })
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "HEAD"], repo())).toBe(head);
  });
});
