import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workTreeRoot } from "@/backend/utils/git";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let outside: string;
let subfolder: string;
let link: string;

beforeAll(() => {
  repo = fs.realpathSync.native(makeRepo());
  outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ngg-test-outside-")));
  subfolder = path.join(repo, "packages", "app");
  fs.mkdirSync(subfolder, { recursive: true });
  link = path.join(outside, "linked repo");
  // Windows creates directory junctions without extra privileges.
  fs.symlinkSync(repo, link, "junction");
});

afterAll(() => {
  fs.rmSync(outside, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("workTreeRoot", () => {
  it("maps the repository, a subfolder, and a symlink to the repository's real path", async () => {
    const directories = [repo, subfolder, link, path.join(link, "packages")];
    expect(
      await Promise.all(directories.map((directory) => workTreeRoot(directory, "git")))
    ).toEqual(directories.map(() => repo));
  });

  it("returns null outside a work tree", async () => {
    expect(await workTreeRoot(outside, "git")).toBeNull();
    expect(await workTreeRoot(path.join(repo, ".git"), "git")).toBeNull();
  });

  it("rejects when Git cannot run", async () => {
    await expect(workTreeRoot(path.join(outside, "missing"), "git")).rejects.toThrow();
    await expect(workTreeRoot(repo, path.join(outside, "missing-git"))).rejects.toThrow();
  });
});
