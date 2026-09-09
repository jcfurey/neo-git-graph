# Working from the graph

All controls act on the repository selected in the graph, including initialized submodules. Clicking a repository's graph button in Source Control switches the graph to that repository. An action already running keeps its original repository; closing its dialog does not cancel Git.

## Remotes and tracking

Open **Remotes** in the header to add a remote, edit its fetch and push URLs, rename or remove it, or choose the repository's default push remote. Multiple URLs are entered one per line. Leaving push URLs blank restores Git's fallback to fetch URLs. Removing a remote removes its local remote-tracking references, not the server or local branches.

Right-click a local branch and choose **Configure Upstream** to set, change or clear tracking without pushing. The status strip shows the checked-out branch's upstream and ahead/behind counts. Counts reflect the last fetch. Branch labels also show nonzero counts, and their tooltips identify worktree locations.

**Fetch** can update one or all remotes, optionally pruning stale remote-tracking branches. Remote checkout offers **Fetch the latest remote revision before checkout**, enabled by default. It creates an explicit tracking branch, or checks out and fast-forwards an existing local branch. Divergent history is not reset.

**Push Branch** works for any local branch, including one that is not checked out. Choose the remote and destination branch, and optionally set upstream tracking. **Pull Branch** is available on the checked-out branch and uses fast-forward only.

Tag pushes use a remote chooser. Remote branch and tag menus also offer deletion, with confirmation naming the destination remote. Deleting a remote ref leaves the local branch or tag intact.

For deliberately rewritten commits, select **Force with lease** in the push dialog. The confirmation captures the last fetched remote commit. The push fails if the server has moved from that exact commit, even if another client fetches in the meantime. Fetch and inspect the remote branch before retrying a rejected lease.

## Conflicts and interrupted operations

The status strip identifies merges, rebases, cherry-picks and reverts in progress, including operations started outside the extension. It lists conflicted files and offers **Open Conflict** and **Stage Resolution**. Open Conflict uses VS Code's merge editor, falling back to opening the file.

After resolving and staging conflicts, use **Continue**. **Abort** restores the operation's starting state. **Skip Commit** is available for rebase, cherry-pick and revert. Git's own checks still apply. Changes to the operation between displaying and submitting a confirmation require a fresh status.

## Stashes

Open **Stashes** to save changes, optionally including untracked files. Each stash can be inspected as a diff in VS Code, applied, popped or dropped. Apply and pop can restore staged changes as staged. A conflicting pop keeps the stash and displays the conflicts. Drop requires confirmation. Stash selections include the commit ID so a newer stash does not silently redirect a pending action.

## Rebasing

Right-click a branch and choose **Rebase current branch onto this**. Commit or stash changes first. This uses Git's merge-preserving rebase and offers the same recovery controls if it stops.

For interactive editing, right-click an ancestor commit and choose **Rebase Commits After This**. The plan contains the current branch's commits after that ancestor, from oldest to newest. Move commits earlier or later, choose Pick/Reword/Squash/Drop, and edit messages for Reword. Squash combines with the preceding retained commit and keeps the combined messages. At least one commit must remain, and the first retained commit cannot be squashed.

Interactive plans support linear ranges. A range containing merge commits is rejected instead of silently flattening its history. The plan is also rejected if the branch changes before submission. Plans and editor helpers live in that worktree's Git directory while a rebase is in progress and are removed after completion or abort; continuation works after reloading VS Code.

## Worktrees

Open **Worktrees** to inspect locations and checked-out branches, create a worktree, open one in a new VS Code window, or remove one. Creation accepts an absolute folder path and either a new branch with a start point or an existing branch. A branch already checked out elsewhere cannot be reused.

Removal preserves the branch. The main/current worktree cannot be removed from this control, and Git refuses removal of dirty or locked worktrees. No forced deletion is performed.
