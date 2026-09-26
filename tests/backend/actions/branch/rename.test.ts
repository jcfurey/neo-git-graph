import { describe, expect, it } from "vitest";

import { renameBranch } from "@/backend/actions/branch";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

const repo = freshRepo((dir) => git(["branch", "old-name"], dir));
const branches = () =>
  gitOutput(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], repo()).split("\n");

describe("renameBranch", () => {
  it("renames an existing branch and keeps its commit", async () => {
    const tip = gitOutput(["rev-parse", "old-name"], repo());
    await renameBranch(createGit(repo(), "git"), { oldName: "old-name", newName: "new-name" });
    expect(branches()).toEqual(["main", "new-name"]);
    expect(gitOutput(["rev-parse", "new-name"], repo())).toBe(tip);
  });

  it("throws when the source branch does not exist", async () => {
    await expect(
      renameBranch(createGit(repo(), "git"), { oldName: "missing", newName: "whatever" })
    ).rejects.toThrow();
    expect(branches()).toEqual(["main", "old-name"]);
  });

  it("throws when the target branch already exists", async () => {
    await expect(
      renameBranch(createGit(repo(), "git"), { oldName: "old-name", newName: "main" })
    ).rejects.toThrow();
    expect(branches()).toEqual(["main", "old-name"]);
  });
});
