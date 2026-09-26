import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";
import { runGit } from "@/backend/utils/runGit";
import { requireRemote, requireTagName } from "@/backend/utils/validation";

export async function addTag(git: SimpleGit, input: ActionPayload<"addTag">): Promise<void> {
  await requireTagName(git, input.tagName);
  await git.tag([
    ...(input.lightweight ? [] : ["-a", "-m", input.message]),
    "--",
    input.tagName,
    input.commitHash
  ]);
}

export async function deleteTag(git: SimpleGit, input: ActionPayload<"deleteTag">): Promise<void> {
  await git.tag(["-d", "--", input.tagName]);
}

export async function pushTag(git: SimpleGit, input: ActionPayload<"pushTag">): Promise<void> {
  await requireRemote(git, input.remote);
  await requireTagName(git, input.tagName);
  await runGit(git, [
    "push",
    "--",
    input.remote,
    `refs/tags/${input.tagName}:refs/tags/${input.tagName}`
  ]);
}
