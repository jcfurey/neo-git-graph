import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mergeCommit } from "@/backend/actions/merge";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let featureCommitHash: string;

beforeAll(() => {
  repo = makeRepo();
  git(["checkout", "-b", "feature"], repo);
  fs.writeFileSync(path.join(repo, "feature.txt"), "feature");
  git(["add", "."], repo);
  git(["commit", "-m", "feature commit"], repo);
  featureCommitHash = cp
    .execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
    .toString()
    .trim();
  git(["checkout", "main"], repo);
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("mergeCommit", () => {
  it("merges a commit hash", async () => {
    await mergeCommit(
      createGit(repo, "git"),
      {
        commitHash: featureCommitHash,
        createNewCommit: false
      },
      "git"
    );

    const log = cp.execFileSync("git", ["log", "--oneline"], { cwd: repo }).toString();
    expect(log).toContain("feature commit");
  });

  it("merges a commit hash with --no-ff when createNewCommit is true", async () => {
    git(["checkout", "-b", "feature2"], repo);
    fs.writeFileSync(path.join(repo, "feature2.txt"), "feature2");
    git(["add", "."], repo);
    git(["commit", "-m", "feature2 commit"], repo);
    const commit2Hash = cp
      .execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
      .toString()
      .trim();
    git(["checkout", "main"], repo);

    await mergeCommit(
      createGit(repo, "git"),
      {
        commitHash: commit2Hash,
        createNewCommit: true
      },
      "git"
    );

    const log = cp.execFileSync("git", ["log", "--oneline"], { cwd: repo }).toString();
    expect(log).toContain("Merge commit");
  });

  it("throws when the commit hash is invalid", async () => {
    await expect(
      mergeCommit(
        createGit(repo, "git"),
        {
          commitHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          createNewCommit: false
        },
        "git"
      )
    ).rejects.toThrow();
  });
});
