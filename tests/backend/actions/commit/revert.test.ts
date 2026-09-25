import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { revertCommit } from "@/backend/actions/commit";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let commitHash: string;

beforeAll(() => {
  repo = makeRepo();
  fs.writeFileSync(path.join(repo, "g"), "revert-me");
  git(["add", "."], repo);
  git(["commit", "-m", "second commit"], repo);
  commitHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("revertCommit", () => {
  it("reverts a commit", async () => {
    await revertCommit(createGit(repo, "git"), { commitHash, parentIndex: 0 });
    expect(fs.existsSync(path.join(repo, "g"))).toBe(false);
  });

  it("throws for a nonexistent commit hash", async () => {
    await expect(
      revertCommit(createGit(repo, "git"), {
        commitHash: "0000000000000000000000000000000000000000",
        parentIndex: 0
      })
    ).rejects.toThrow();
  });
});
