import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { mergeBranch } from "@/backend/actions/merge";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => {
  git(["checkout", "-q", "-b", "feature"], dir);
  fs.writeFileSync(path.join(dir, "feature.txt"), "feature");
  git(["add", "feature.txt"], dir);
  git(["commit", "-m", "feature commit"], dir);
  git(["checkout", "-q", "main"], dir);
});

describe("mergeBranch", () => {
  it("fast-forwards when a merge commit is not requested", async () => {
    await mergeBranch(
      createGit(repo(), "git"),
      { branchName: "feature", createNewCommit: false },
      "git"
    );
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(
      gitOutput(["rev-parse", "feature"], repo())
    );
  });

  it("creates a merge commit named after the branch with --no-ff", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await mergeBranch(
      createGit(repo(), "git"),
      { branchName: "feature", createNewCommit: true },
      "git"
    );
    expect(gitOutput(["rev-parse", "HEAD^1"], repo())).toBe(main);
    expect(gitOutput(["rev-parse", "HEAD^2"], repo())).toBe(
      gitOutput(["rev-parse", "feature"], repo())
    );
    expect(gitOutput(["log", "-1", "--format=%s"], repo())).toBe("Merge branch 'feature'");
  });

  it("throws when the branch does not exist and leaves main unchanged", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await expect(
      mergeBranch(
        createGit(repo(), "git"),
        { branchName: "nonexistent-branch", createNewCommit: false },
        "git"
      )
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(main);
  });
});
