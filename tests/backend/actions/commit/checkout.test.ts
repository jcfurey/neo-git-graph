import { describe, expect, it } from "vitest";

import { checkoutCommit } from "@/backend/actions/commit";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => git(["commit", "--allow-empty", "-m", "second"], dir));

describe("checkoutCommit", () => {
  it("checks out a commit with a detached HEAD", async () => {
    const first = gitOutput(["rev-parse", "HEAD^"], repo());
    await checkoutCommit(createGit(repo(), "git"), { commitHash: first });
    expect(gitOutput(["rev-parse", "HEAD"], repo())).toBe(first);
    expect(() => gitOutput(["symbolic-ref", "-q", "HEAD"], repo())).toThrow();
    expect(gitOutput(["rev-parse", "main"], repo())).not.toBe(first);
  });

  it("throws for a nonexistent commit and stays on the branch", async () => {
    await expect(
      checkoutCommit(createGit(repo(), "git"), { commitHash: "0".repeat(40) })
    ).rejects.toThrow();
    expect(gitOutput(["symbolic-ref", "HEAD"], repo())).toBe("refs/heads/main");
  });
});
