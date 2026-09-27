import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getRepoRoot } from "@/backend/utils/git";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let nonGitDir: string;
let link: string;

beforeAll(() => {
  repo = makeRepo();
  nonGitDir = fs.mkdtempSync(os.tmpdir() + "/ngg-test-nongit-");
  fs.mkdirSync(path.join(repo, "packages", "app"), { recursive: true });
  link = path.join(nonGitDir, "linked repository");
  // Windows creates directory junctions without extra privileges.
  fs.symlinkSync(repo, link, "junction");
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(nonGitDir, { recursive: true, force: true });
});

describe("getRepoRoot", () => {
  it("returns the top level for a repository and its subfolders", async () => {
    expect(await getRepoRoot(repo, "git")).toBe(repo);
    expect(await getRepoRoot(path.join(repo, "packages", "app"), "git")).toBe(repo);
  });

  it("keeps the path of a symlinked repository", async () => {
    expect(await getRepoRoot(link, "git")).toBe(link);
    expect(await getRepoRoot(path.join(link, "packages"), "git")).toBe(link);
  });

  it("returns null outside a work tree", async () => {
    expect(await getRepoRoot(nonGitDir, "git")).toBeNull();
    expect(await getRepoRoot(path.join(nonGitDir, "missing"), "git")).toBeNull();
  });
});
