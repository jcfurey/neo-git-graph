import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

import { simpleGit } from "simple-git";
import { afterAll, beforeAll, expect, it } from "vitest";

import { repositoryQuery } from "@/backend/queries/repository";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let base: string;
let main: string;
let merged: string;
let side: string;
let tip: string;
const hash = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();

beforeAll(() => {
  repo = makeRepo();
  base = hash();
  git(["checkout", "-b", "merged"], repo);
  git(["commit", "--allow-empty", "-m", "merged contribution"], repo);
  merged = hash();
  git(["checkout", "-b", "side", base], repo);
  git(["commit", "--allow-empty", "-m", "unmerged contribution"], repo);
  side = hash();
  git(["checkout", "main"], repo);
  git(["commit", "--allow-empty", "-m", "main line"], repo);
  main = hash();
  git(["merge", "--no-ff", "merged", "-m", "merge contribution"], repo);
  tip = hash();
  git(["update-ref", "refs/remotes/origin/main", tip], repo);
  git(["tag", "main", side], repo);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

it("distinguishes direct, merged and unrelated history without requiring the tip or connecting rows", async () => {
  const before = hash();
  const result = await repositoryQuery(simpleGit(repo), {
    kind: "branchFocus",
    branch: "main",
    hashes: [base, merged, side, "*"]
  });
  expect(result).toEqual({ kind: "branchFocus", tip, direct: [base], merged: [merged] });
  expect(hash()).toBe(before);
});

it("handles remote refs and changes the direct line when focusing a merged branch", async () => {
  const remote = await repositoryQuery(simpleGit(repo), {
    kind: "branchFocus",
    branch: "remotes/origin/main",
    hashes: [tip, main, base, merged, side]
  });
  expect(remote).toEqual({ kind: "branchFocus", tip, direct: [tip, main, base], merged: [merged] });
  expect(
    await repositoryQuery(simpleGit(repo), {
      kind: "branchFocus",
      branch: "merged",
      hashes: [tip, main, base, merged, side]
    })
  ).toEqual({ kind: "branchFocus", tip: merged, direct: [merged, base], merged: [] });
});

it.each(["missing", "main~1", "--all"])(
  "rejects invalid branch %s instead of colouring everything unrelated",
  async (branch) => {
    await expect(
      repositoryQuery(simpleGit(repo), {
        kind: "branchFocus",
        branch,
        hashes: [base]
      })
    ).rejects.toThrow();
  }
);
