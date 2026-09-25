import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetToCommit } from "@/backend/actions/commit";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let firstHash: string;

beforeAll(() => {
  repo = makeRepo();
  firstHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
  fs.writeFileSync(path.join(repo, "f"), "y");
  git(["add", "."], repo);
  git(["commit", "-m", "second"], repo);
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("resetToCommit", () => {
  it("soft-resets to a previous commit", async () => {
    await resetToCommit(createGit(repo, "git"), {
      commitHash: firstHash,
      resetMode: "soft"
    });

    const head = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    expect(head).toBe(firstHash);

    git(["commit", "-m", "second"], repo);
  });

  it("mixed-resets to a previous commit", async () => {
    await resetToCommit(createGit(repo, "git"), {
      commitHash: firstHash,
      resetMode: "mixed"
    });

    const head = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    expect(head).toBe(firstHash);

    git(["add", "."], repo);
    git(["commit", "-m", "second"], repo);
  });

  it("hard-resets to a previous commit", async () => {
    await resetToCommit(createGit(repo, "git"), {
      commitHash: firstHash,
      resetMode: "hard"
    });

    const head = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    expect(head).toBe(firstHash);
  });

  it("throws for an invalid commit hash", async () => {
    await expect(
      resetToCommit(createGit(repo, "git"), {
        commitHash: "0000000000000000000000000000000000000000",
        resetMode: "hard"
      })
    ).rejects.toThrow();
  });
});
