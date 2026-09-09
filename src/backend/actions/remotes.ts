import type { SimpleGit } from "simple-git";

import type { RepositoryAction } from "@/backend/types";
import { requireBranchName, requireRemote } from "@/backend/utils/validation";

type RemoteAction = Extract<
  RepositoryAction,
  {
    kind:
      | "addRemote"
      | "editRemote"
      | "renameRemote"
      | "removeRemote"
      | "pushDefault"
      | "setTracking"
      | "deleteRemoteRef";
  }
>;

async function requireRemoteName(git: SimpleGit, name: string) {
  if (!name || name.startsWith("-") || name === ".") {
    throw new Error("Enter a valid remote name.");
  }
  await git.raw(["check-ref-format", `refs/remotes/${name}/branch`]);
}

function requireUrl(url: string) {
  if (!url.trim() || /[\r\n\0]/.test(url) || url.startsWith("-")) {
    throw new Error("Enter a nonempty remote URL without line breaks.");
  }
}

async function replaceConfig(git: SimpleGit, key: string, values: string[]) {
  const existing = await git.getConfig(key, "local");
  if (values.length === 0) {
    if (existing.values.length > 0) {
      await git.raw(["config", "--local", "--unset-all", key]);
    }
    return;
  }
  await git.raw(["config", "--local", "--replace-all", key, values[0]!]);
  for (const value of values.slice(1)) {
    // Git config writes share config.lock and must preserve URL order.
    // eslint-disable-next-line no-await-in-loop
    await git.raw(["config", "--local", "--add", key, value]);
  }
}

async function updatePushDefaults(git: SimpleGit, oldName: string, newName: string | null) {
  const branches = await git.branchLocal();
  const keys = ["remote.pushDefault", ...branches.all.map((name) => `branch.${name}.pushRemote`)];
  const settings = await Promise.all(keys.map((key) => git.getConfig(key)));
  for (const [index, key] of keys.entries()) {
    if (settings[index]?.value === oldName) {
      // Serialize writes to the repository's config.lock.
      // eslint-disable-next-line no-await-in-loop
      await replaceConfig(git, key, newName === null ? [] : [newName]);
    }
  }
}

export async function manageRemote(git: SimpleGit, action: RemoteAction) {
  switch (action.kind) {
    case "addRemote":
      await requireRemoteName(git, action.name);
      requireUrl(action.url);
      await git.raw(["remote", "add", "--", action.name, action.url]);
      if (action.fetch) {
        await git.raw(["fetch", "--", action.name]);
      }
      return;
    case "editRemote":
      await requireRemote(git, action.name);
      if (action.fetchUrls.length === 0) {
        throw new Error("A remote needs at least one fetch URL.");
      }
      [...action.fetchUrls, ...action.pushUrls].forEach(requireUrl);
      await replaceConfig(git, `remote.${action.name}.url`, action.fetchUrls);
      await replaceConfig(git, `remote.${action.name}.pushurl`, action.pushUrls);
      return;
    case "renameRemote":
      await requireRemote(git, action.name);
      await requireRemoteName(git, action.newName);
      await git.raw(["remote", "rename", "--", action.name, action.newName]);
      await updatePushDefaults(git, action.name, action.newName);
      return;
    case "removeRemote":
      await requireRemote(git, action.name);
      await git.raw(["remote", "remove", "--", action.name]);
      await updatePushDefaults(git, action.name, null);
      return;
    case "pushDefault":
      if (action.remote !== null) {
        await requireRemote(git, action.remote);
      }
      await replaceConfig(git, "remote.pushDefault", action.remote === null ? [] : [action.remote]);
      return;
    case "setTracking":
      await requireBranchName(git, action.branch);
      if (action.upstream === null) {
        await git.raw(["branch", "--unset-upstream", "--", action.branch]);
      } else {
        await git.raw(["branch", `--set-upstream-to=${action.upstream}`, "--", action.branch]);
      }
      return;
    case "deleteRemoteRef": {
      await requireRemote(git, action.remote);
      const ref = `refs/${action.refType === "tag" ? "tags" : "heads"}/${action.name}`;
      await git.raw(["check-ref-format", ref]);
      await git.raw(["push", "--", action.remote, `:${ref}`]);
      return;
    }
  }
}
