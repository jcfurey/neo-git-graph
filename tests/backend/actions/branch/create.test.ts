import { describe, expect, it } from "vitest";

import { createBranch } from "@/backend/actions/branch";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => git(["commit", "--allow-empty", "-m", "second"], dir));

describe("createBranch", () => {
  it("creates a branch at the given commit without checking it out", async () => {
    const first = gitOutput(["rev-parse", "HEAD^"], repo());
    await createBranch(createGit(repo(), "git"), { branchName: "new-branch", commitHash: first });
    expect(gitOutput(["rev-parse", "refs/heads/new-branch"], repo())).toBe(first);
    expect(gitOutput(["symbolic-ref", "HEAD"], repo())).toBe("refs/heads/main");
  });

  it("throws when the branch already exists and keeps it", async () => {
    const main = gitOutput(["rev-parse", "main"], repo());
    await expect(
      createBranch(createGit(repo(), "git"), {
        branchName: "main",
        commitHash: gitOutput(["rev-parse", "HEAD^"], repo())
      })
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "main"], repo())).toBe(main);
  });

  it("throws when the commit hash is invalid", async () => {
    await expect(
      createBranch(createGit(repo(), "git"), {
        branchName: "bad-branch",
        commitHash: "deadbeef".repeat(5)
      })
    ).rejects.toThrow();
    expect(gitOutput(["for-each-ref", "--format=%(refname)", "refs/heads/"], repo())).toBe(
      "refs/heads/main"
    );
  });
});
