import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pushTag } from "@/backend/actions/tag";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, refNames } from "@tests/backend/helpers";

let bare: string;
const repo = freshRepo();

beforeEach(() => {
  bare = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-test-bare-"));
  git(["init", "-q", "--bare", bare], repo());
  git(["remote", "add", "origin", bare], repo());
  git(["push", "-q", "origin", "main"], repo());
  git(["tag", "v1.0"], repo());
  git(["tag", "v2.0"], repo());
});

afterEach(() => fs.rmSync(bare, { recursive: true, force: true }));

describe("pushTag", () => {
  it("pushes only the named tag", async () => {
    await pushTag(createGit(repo(), "git"), { tagName: "v1.0", remote: "origin" });
    expect(refNames("refs/tags/", bare)).toEqual(["v1.0"]);
  });

  it("throws when the tag does not exist locally", async () => {
    await expect(
      pushTag(createGit(repo(), "git"), { tagName: "v99.0-nonexistent", remote: "origin" })
    ).rejects.toThrow();
    expect(refNames("refs/tags/", bare)).toEqual([]);
  });
});
