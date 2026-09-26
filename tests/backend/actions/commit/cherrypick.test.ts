import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { cherrypickCommit } from "@/backend/actions/commit";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => {
  git(["checkout", "-q", "-b", "side"], dir);
  fs.writeFileSync(path.join(dir, "g"), "cherry");
  git(["add", "g"], dir);
  git(["commit", "-m", "cherry commit"], dir);
  git(["checkout", "-q", "main"], dir);
  // A different parent makes the picked commit new even within the same second.
  git(["commit", "--allow-empty", "-m", "main work"], dir);
});

describe("cherrypickCommit", () => {
  it("applies the commit as a new commit on the current branch", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await cherrypickCommit(createGit(repo(), "git"), {
      commitHash: gitOutput(["rev-parse", "side"], repo()),
      parentIndex: 0
    });
    expect(gitOutput(["rev-parse", "HEAD^"], repo())).toBe(main);
    expect(gitOutput(["log", "-1", "--format=%s"], repo())).toBe("cherry commit");
    expect(fs.readFileSync(path.join(repo(), "g"), "utf8")).toBe("cherry");
    expect(gitOutput(["rev-parse", "HEAD"], repo())).not.toBe(
      gitOutput(["rev-parse", "side"], repo())
    );
  });

  it("throws for a nonexistent commit and leaves the branch unchanged", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await expect(
      cherrypickCommit(createGit(repo(), "git"), { commitHash: "0".repeat(40), parentIndex: 0 })
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(main);
  });
});
