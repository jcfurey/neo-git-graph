import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSubmodulePaths } from "@/backend/utils/git";

import { git, makeRepo } from "@tests/backend/helpers";

const allowFile = ["-c", "protocol.file.allow=always"];

let parent: string;
let childSource: string;
let nestedSource: string;

beforeAll(() => {
  parent = fs.realpathSync.native(makeRepo());
  childSource = makeRepo();
  nestedSource = makeRepo();

  git([...allowFile, "submodule", "add", nestedSource, "nested module"], childSource);
  git(["commit", "-m", "Add nested submodule"], childSource);

  git([...allowFile, "submodule", "add", childSource, "src/child module"], parent);
  git([...allowFile, "submodule", "update", "--init", "--recursive"], parent);

  git([...allowFile, "submodule", "add", nestedSource, "not initialized"], parent);
  git(["submodule", "deinit", "--force", "--", "not initialized"], parent);
});

afterAll(() => {
  for (const repo of [parent, childSource, nestedSource]) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe("getSubmodulePaths", () => {
  it("returns initialized submodules, nested ones included, with spaces preserved", async () => {
    const child = path.join(parent, "src", "child module");
    expect(await getSubmodulePaths(parent, "git")).toEqual([
      child,
      path.join(child, "nested module")
    ]);
  });

  it("returns no submodules for an ordinary repository", async () => {
    expect(await getSubmodulePaths(nestedSource, "git")).toEqual([]);
  });

  it("returns no submodules when Git cannot run", async () => {
    expect(await getSubmodulePaths(parent, path.join(parent, "missing-git"))).toEqual([]);
  });
});
