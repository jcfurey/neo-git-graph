import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteBranch } from "@/backend/actions/branch";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;

beforeAll(() => {
  repo = makeRepo();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("deleteBranch", () => {
  it("deletes an existing branch", async () => {
    git(["branch", "to-delete"], repo);

    await deleteBranch(createGit(repo, "git"), {
      branchName: "to-delete",
      forceDelete: false
    });

    const listed = cp
      .execFileSync("git", ["branch", "--no-color", "--list", "to-delete"], { cwd: repo })
      .toString()
      .trim();
    expect(listed).toBe("");
  });

  it("throws when deleting a branch with unmerged changes without force", async () => {
    git(["checkout", "-b", "unmerged"], repo);
    fs.writeFileSync(path.join(repo, "g"), "y");
    git(["add", "."], repo);
    git(["commit", "-m", "unmerged commit"], repo);
    git(["checkout", "main"], repo);

    await expect(
      deleteBranch(createGit(repo, "git"), {
        branchName: "unmerged",
        forceDelete: false
      })
    ).rejects.toThrow();
  });

  it("force-deletes a branch with unmerged changes", async () => {
    await deleteBranch(createGit(repo, "git"), {
      branchName: "unmerged",
      forceDelete: true
    });

    const listed = cp
      .execFileSync("git", ["branch", "--no-color", "--list", "unmerged"], { cwd: repo })
      .toString()
      .trim();
    expect(listed).toBe("");
  });

  it("throws when the branch does not exist", async () => {
    await expect(
      deleteBranch(createGit(repo, "git"), {
        branchName: "nonexistent",
        forceDelete: false
      })
    ).rejects.toThrow();
  });
});
