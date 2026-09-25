/**
 * The full ref of a branch-list entry. Branch lists name remote-tracking branches
 * `remotes/<remote>/<branch>`. A full ref cannot be read as an option, a tag, or a path.
 */
export function branchListRef(branch: string) {
  return branch.startsWith("remotes/") ? `refs/${branch}` : `refs/heads/${branch}`;
}
