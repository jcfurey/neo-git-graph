import { describe, expect, it } from "vitest";

import { addTag } from "@/backend/actions/tag";
import { createGit } from "@/backend/gitClient";

import { freshRepo, git, gitOutput, refNames } from "@tests/backend/helpers";

const repo = freshRepo();
const head = () => gitOutput(["rev-parse", "HEAD"], repo());

describe("addTag", () => {
  it("creates a lightweight tag at the given commit", async () => {
    await addTag(createGit(repo(), "git"), {
      tagName: "v1.0-lw",
      commitHash: head(),
      lightweight: true,
      message: ""
    });
    expect(gitOutput(["cat-file", "-t", "refs/tags/v1.0-lw"], repo())).toBe("commit");
    expect(gitOutput(["rev-parse", "refs/tags/v1.0-lw"], repo())).toBe(head());
  });

  it("creates an annotated tag with its message at the given commit", async () => {
    await addTag(createGit(repo(), "git"), {
      tagName: "v1.0",
      commitHash: head(),
      lightweight: false,
      message: "Release v1.0"
    });
    expect(gitOutput(["cat-file", "-t", "refs/tags/v1.0"], repo())).toBe("tag");
    expect(gitOutput(["rev-parse", "v1.0^{commit}"], repo())).toBe(head());
    expect(gitOutput(["tag", "-l", "--format=%(contents:subject)", "v1.0"], repo())).toBe(
      "Release v1.0"
    );
  });

  it("throws when the tag already exists and keeps it", async () => {
    git(["commit", "--allow-empty", "-m", "newer"], repo());
    git(["tag", "existing", "HEAD^"], repo());
    const tagged = gitOutput(["rev-parse", "existing"], repo());
    await expect(
      addTag(createGit(repo(), "git"), {
        tagName: "existing",
        commitHash: head(),
        lightweight: true,
        message: ""
      })
    ).rejects.toThrow();
    expect(gitOutput(["rev-parse", "existing"], repo())).toBe(tagged);
  });

  it("throws when the commit hash is invalid", async () => {
    await expect(
      addTag(createGit(repo(), "git"), {
        tagName: "v2.0",
        commitHash: "deadbeef".repeat(5),
        lightweight: true,
        message: ""
      })
    ).rejects.toThrow();
    expect(refNames("refs/tags/", repo())).toEqual([]);
  });
});
