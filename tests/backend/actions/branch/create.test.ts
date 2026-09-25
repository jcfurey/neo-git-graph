import * as cp from "node:child_process";
import * as fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBranch } from "@/backend/actions/branch";
import { createGit } from "@/backend/gitClient";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let commitHash: string;

beforeAll(() => {
  repo = makeRepo();
  commitHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("createBranch", () => {
  it("creates a new branch at the given commit", async () => {
    await createBranch(createGit(repo, "git"), {
      branchName: "new-branch",
      commitHash
    });

    const listed = cp
      .execFileSync("git", ["branch", "--no-color", "--list", "new-branch"], { cwd: repo })
      .toString()
      .trim();
    expect(listed).toBe("new-branch");
  });

  it("throws when the branch already exists", async () => {
    await expect(
      createBranch(createGit(repo, "git"), { branchName: "main", commitHash })
    ).rejects.toThrow();
  });

  it("throws when the commit hash is invalid", async () => {
    await expect(
      createBranch(createGit(repo, "git"), {
        branchName: "bad-branch",
        commitHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      })
    ).rejects.toThrow();
  });
});
