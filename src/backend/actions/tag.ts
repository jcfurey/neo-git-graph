import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";

export async function addTag(git: SimpleGit, input: ActionPayload<"addTag">): Promise<void> {
  const args: string[] = [];
  if (!input.lightweight) {
    args.push("-a", "-m", input.message);
  }
  args.push("--", input.tagName, input.commitHash);
  await git.tag(args);
}

export async function deleteTag(git: SimpleGit, input: ActionPayload<"deleteTag">): Promise<void> {
  await git.tag(["-d", "--", input.tagName]);
}

export async function pushTag(git: SimpleGit, input: ActionPayload<"pushTag">): Promise<void> {
  // A full refspec cannot be read as an option such as --mirror.
  const ref = `refs/tags/${input.tagName}`;
  await git.push("origin", `${ref}:${ref}`);
}
