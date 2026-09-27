import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { describe, expect, it } from "vitest";

import { deleteBranch } from "@/backend/actions/branch";

import { freshRepo, git, gitOutput } from "@tests/backend/helpers";

// "merged" points into main's history; "unmerged" has a commit main does not.
const repo = freshRepo((dir) => {
  git(["branch", "merged"], dir);
  git(["checkout", "-q", "-b", "unmerged"], dir);
  fs.writeFileSync(path.join(dir, "g"), "y");
  git(["add", "g"], dir);
  git(["commit", "-m", "unmerged commit"], dir);
  git(["checkout", "-q", "main"], dir);
});
const branches = () =>
  gitOutput(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], repo()).split("\n");

describe("deleteBranch", () => {
  it("deletes a merged branch without force", async () => {
    await deleteBranch(simpleGit(repo()), { branchName: "merged", forceDelete: false });
    expect(branches()).toEqual(["main", "unmerged"]);
  });

  it("refuses to delete an unmerged branch without force", async () => {
    await expect(
      deleteBranch(simpleGit(repo()), { branchName: "unmerged", forceDelete: false })
    ).rejects.toThrow();
    expect(branches()).toEqual(["main", "merged", "unmerged"]);
  });

  it("force-deletes an unmerged branch", async () => {
    await deleteBranch(simpleGit(repo()), { branchName: "unmerged", forceDelete: true });
    expect(branches()).toEqual(["main", "merged"]);
  });

  it("throws when the branch does not exist", async () => {
    await expect(
      deleteBranch(simpleGit(repo()), { branchName: "nonexistent", forceDelete: true })
    ).rejects.toThrow();
    expect(branches()).toEqual(["main", "merged", "unmerged"]);
  });
});
