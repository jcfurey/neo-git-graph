import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { mergeCommit } from "@/backend/actions/merge";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => {
  git(["checkout", "-q", "-b", "feature"], dir);
  fs.writeFileSync(path.join(dir, "feature.txt"), "feature");
  git(["add", "feature.txt"], dir);
  git(["commit", "-m", "feature commit"], dir);
  git(["checkout", "-q", "main"], dir);
});
const feature = () => gitOutput(["rev-parse", "feature"], repo());

describe("mergeCommit", () => {
  it("fast-forwards to a commit when a merge commit is not requested", async () => {
    await mergeCommit(
      createGit(repo(), "git"),
      { commitHash: feature(), createNewCommit: false },
      "git"
    );
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(feature());
  });

  it("creates a merge commit with --no-ff", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await mergeCommit(
      createGit(repo(), "git"),
      { commitHash: feature(), createNewCommit: true },
      "git"
    );
    expect(gitOutput(["rev-parse", "HEAD^1"], repo())).toBe(main);
    expect(gitOutput(["rev-parse", "HEAD^2"], repo())).toBe(feature());
    expect(gitOutput(["log", "-1", "--format=%s"], repo())).toMatch(/^Merge commit '/);
  });

  it("throws when the commit hash is invalid and leaves main unchanged", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await expect(
      mergeCommit(
        createGit(repo(), "git"),
        { commitHash: "deadbeef".repeat(5), createNewCommit: false },
        "git"
      )
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(main);
  });
});
