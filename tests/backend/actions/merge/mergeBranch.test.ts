import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mergeBranch } from "@/backend/actions/merge";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;

beforeAll(() => {
  repo = makeRepo();
  git(["checkout", "-b", "feature"], repo);
  fs.writeFileSync(path.join(repo, "feature.txt"), "feature");
  git(["add", "."], repo);
  git(["commit", "-m", "feature commit"], repo);
  git(["checkout", "main"], repo);
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("mergeBranch", () => {
  it("merges a branch with fast-forward by default", async () => {
    await mergeBranch(
      createGit(repo, "git"),
      {
        branchName: "feature",
        createNewCommit: false
      },
      "git"
    );

    const log = cp.execFileSync("git", ["log", "--oneline"], { cwd: repo }).toString();
    expect(log).toContain("feature commit");
  });

  it("merges a branch with --no-ff when createNewCommit is true", async () => {
    git(["checkout", "-b", "feature2"], repo);
    fs.writeFileSync(path.join(repo, "feature2.txt"), "feature2");
    git(["add", "."], repo);
    git(["commit", "-m", "feature2 commit"], repo);
    git(["checkout", "main"], repo);

    await mergeBranch(
      createGit(repo, "git"),
      {
        branchName: "feature2",
        createNewCommit: true
      },
      "git"
    );

    const log = cp.execFileSync("git", ["log", "--oneline"], { cwd: repo }).toString();
    expect(log).toContain("Merge branch");
  });

  it("throws when the branch does not exist", async () => {
    await expect(
      mergeBranch(
        createGit(repo, "git"),
        {
          branchName: "nonexistent-branch",
          createNewCommit: false
        },
        "git"
      )
    ).rejects.toThrow();
  });
});
