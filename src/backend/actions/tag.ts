import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";
import { requireRemote } from "@/backend/utils/validation";

export async function addTag(git: SimpleGit, input: ActionPayload<"addTag">): Promise<void> {
  const args: string[] = [];
  if (input.lightweight) {
    args.push(input.tagName);
  } else {
    args.push("-a", input.tagName, "-m", input.message);
  }
  args.push(input.commitHash);
  await git.tag(args);
}

export async function deleteTag(git: SimpleGit, input: ActionPayload<"deleteTag">): Promise<void> {
  await git.tag(["-d", input.tagName]);
}

export async function pushTag(git: SimpleGit, input: ActionPayload<"pushTag">): Promise<void> {
  await requireRemote(git, input.remote);
  await git.raw(["check-ref-format", `refs/tags/${input.tagName}`]);
  await git.raw([
    "push",
    "--",
    input.remote,
    `refs/tags/${input.tagName}:refs/tags/${input.tagName}`
  ]);
}
