import * as cp from "node:child_process";
import * as fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteTag } from "@/backend/actions/tag";
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

describe("deleteTag", () => {
  it("deletes an existing tag", async () => {
    cp.execFileSync("git", ["tag", "v1.0", commitHash], { cwd: repo });

    await deleteTag(createGit(repo, "git"), { tagName: "v1.0" });

    const tags = cp.execFileSync("git", ["tag"], { cwd: repo }).toString().trim();
    expect(tags).not.toContain("v1.0");
  });

  it("throws when the tag does not exist", async () => {
    await expect(deleteTag(createGit(repo, "git"), { tagName: "nonexistent" })).rejects.toThrow();
  });
});
