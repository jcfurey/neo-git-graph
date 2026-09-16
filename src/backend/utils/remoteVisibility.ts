import type { SimpleGit } from "simple-git";

/** Remote names can contain slashes; prefer the longest configured name. */
export function remoteForRef(name: string, remotes: readonly string[]): string {
  return (
    remotes
      .filter((remote) => name.startsWith(remote + "/"))
      .toSorted((a, b) => b.length - a.length)[0] ??
    name.split("/")[0] ??
    name
  );
}

export type RemoteVisibility = {
  showRemoteBranches?: boolean;
  hiddenRemotes?: string[];
};

/** Exclude ref tips, never their shared ancestry with visible branches or tags. */
export async function remoteVisibility(git: SimpleGit, options: RemoteVisibility) {
  const excluded = new Set<string>();
  if (options.showRemoteBranches === false) {
    return { excluded, logArgs: [] as string[] };
  }
  const hidden = new Set(options.hiddenRemotes ?? []);
  if (hidden.size > 0) {
    const [names, refs] = await Promise.all([
      git.raw(["remote"]),
      git.raw(["for-each-ref", "--format=%(refname)", "refs/remotes/"])
    ]);
    const remotes = [...names.trim().split(/\r?\n/).filter(Boolean), ...hidden];
    for (const ref of refs.trim().split(/\r?\n/).filter(Boolean)) {
      const name = ref.slice("refs/remotes/".length);
      if (hidden.has(remoteForRef(name, remotes))) {
        excluded.add(name);
      }
    }
  }
  return {
    excluded,
    logArgs: [...excluded].map((name) => "--exclude=" + name).concat("--remotes")
  };
}
