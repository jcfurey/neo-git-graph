import { simpleGit } from "simple-git";
import { describe, expect, it } from "vitest";

import { deleteTag } from "@/backend/actions/tag";

import { freshRepo, git, refNames } from "@tests/backend/helpers";

const repo = freshRepo((dir) => {
  git(["tag", "v1.0"], dir);
  git(["tag", "v1.1"], dir);
});

describe("deleteTag", () => {
  it("deletes only the named tag", async () => {
    await deleteTag(simpleGit(repo()), { tagName: "v1.0" });
    expect(refNames("refs/tags/", repo())).toEqual(["v1.1"]);
  });

  it("throws when the tag does not exist and keeps the others", async () => {
    await expect(deleteTag(simpleGit(repo()), { tagName: "nonexistent" })).rejects.toThrow();
    expect(refNames("refs/tags/", repo())).toEqual(["v1.0", "v1.1"]);
  });
});
