# Working from the graph

All controls act on the repository selected in the graph, including initialized submodules. Clicking a repository's graph button in Source Control switches the graph to that repository. An action already running keeps its original repository; closing its dialog does not cancel Git.

## Remotes and tracking

Open **Repository Tools → Remotes** to add a remote, edit its fetch and push URLs, rename or remove it, or choose the repository's default push remote. Multiple URLs are entered one per line. Leaving push URLs blank restores Git's fallback to fetch URLs. Removing a remote removes its local remote-tracking references, not the server or local branches.

Right-click a local branch and choose **Configure Upstream** to set, change or clear tracking without pushing. The status strip shows the checked-out branch's upstream and ahead/behind counts. Counts reflect the last fetch. Branch labels also show nonzero counts, and their tooltips identify worktree locations.

**Fetch** can update one or all remotes, optionally pruning stale remote-tracking branches. Remote checkout offers **Fetch the latest remote revision before checkout**, enabled by default. It creates an explicit tracking branch, or checks out and fast-forwards an existing local branch. Divergent history is not reset.

**Push Branch** works for any local branch, including one that is not checked out. Choose the remote and destination branch, and optionally set upstream tracking. **Pull Branch** is available on the checked-out branch and uses fast-forward only.

Tag pushes use a remote chooser. Remote branch and tag menus also offer deletion, with confirmation naming the destination remote. Deleting a remote ref leaves the local branch or tag intact.

For deliberately rewritten commits, select **Force with lease** in the push dialog. The confirmation captures the last fetched remote commit. The push fails if the server has moved from that exact commit, even if another client fetches in the meantime. Fetch and inspect the remote branch before retrying a rejected lease.

## Conflicts and interrupted operations

The status strip identifies merges, rebases, cherry-picks and reverts in progress, including operations started outside the extension. It lists conflicted files and offers **Open Conflict** and **Stage Resolution**. Open Conflict uses VS Code's merge editor, falling back to opening the file.

After resolving and staging conflicts, use **Continue**. **Abort** restores the operation's starting state. **Skip Commit** is available for rebase, cherry-pick and revert. Git's own checks still apply. Changes to the operation between displaying and submitting a confirmation require a fresh status.

## Stashes

Open **Repository Tools → Stashes** to save changes, optionally including untracked files. Each stash can be inspected as a diff in VS Code, applied, popped or dropped. Apply and pop can restore staged changes as staged. A conflicting pop keeps the stash and displays the conflicts. Drop requires confirmation. Stash selections include the commit ID so a newer stash does not silently redirect a pending action.

## Rebasing

Right-click a branch and choose **Rebase current branch onto this**. Commit or stash changes first. This uses Git's merge-preserving rebase and offers the same recovery controls if it stops.

For interactive editing, right-click an ancestor commit and choose **Rebase Commits After This**. The plan contains the current branch's commits after that ancestor, from oldest to newest. Move commits earlier or later, choose Pick/Reword/Squash/Fixup/Drop, and edit messages for Reword. Squash combines with the preceding retained commit and keeps the combined messages; Fixup discards the fixup's message. At least one commit must remain, and the first retained commit cannot be Squash or Fixup.

Stage changes in Source Control, then choose **Create Fixup Commit** on the commit being corrected. Review the staged file list before submitting. **Arrange Fixup / Squash Commits** in the rebase editor places matching `fixup!` and `squash!` commits after their targets while preserving manual edits. Review the resulting order and actions before starting; ambiguous or unmatched targets remain Pick.

Interactive plans support linear ranges. A range containing merge commits is rejected instead of silently flattening its history. The plan is also rejected if the branch changes before submission. Plans and editor helpers live in that worktree's Git directory while a rebase is in progress and are removed after completion or abort; continuation works after reloading VS Code.

## Worktrees

Open **Repository Tools → Worktrees** to inspect locations and checked-out branches, create a worktree, open one in a new VS Code window, or remove one. Creation accepts an absolute folder path and either a new branch with a start point or an existing branch. A branch already checked out elsewhere cannot be reused.

Removal preserves the branch. The main/current worktree cannot be removed from this control, and Git refuses removal of dirty or locked worktrees. No forced deletion is performed.

## Workspace and submodules

**Workspace** toggles a repository sidebar. Each row shows the checked-out branch (or detached HEAD), changed file count, and ahead/behind counts from the last fetch. Click an initialized repository to switch its graph. Filter by name/path or show only repositories with changes; parent rows remain visible for context.

Submodule rows distinguish the actual HEAD, the revision recorded in the parent index, and the revision recorded in the parent commit. Their action menu offers **Initialize Submodule**, **Sync Submodule URLs**, and **Update to Recorded Revision**. Sync copies URLs from `.gitmodules`. Initialize/update use recursive Git checkout of the parent's recorded index revision, including nested submodules. Git checks for conflicting local changes; the extension rejects updates while an initialized child has an interrupted operation. No force checkout or `--remote` advancement is used.

## Search, file history, and comparison

The search row queries repository history beyond the graph's loaded commits, with 100 results per page. Enter a commit message or a resolvable SHA of at least seven characters. **Filters** adds literal author/email and path filters, inclusive dates, rename following for a single file, and named filters saved per repository. A selected branch limits the history to that branch. Filtered results may omit commits between matches. **Return to Graph** clears the filters.

Right-click a file in Explorer, an editor title, or a commit's changed-file list and choose **File History**. Rename following retains the historical path at each commit. From a history row, open that file at its revision or choose **Restore File Contents**. The restore preview lets you choose the destination and compare its working contents with the historical version before confirming. Restore replaces the working file, including binary contents and Git file modes, and preserves the real index. A changed working file or index invalidates the preview. Historical previews use VS Code text documents; binary restoration does not require a text preview.

**Compare** accepts branch names, tags, or commits. Ref/commit menus also provide **Compare with…**, and selecting two rows offers **Compare Selected**. The result lists changed files and commits unique to each endpoint, with native VS Code diffs that leave the comparison dialog open. **Show changes introduced since the common ancestor** compares that ancestor with the right revision; the unique-commit lists still compare the two endpoints. Clicking a listed commit opens graph context beginning at that commit and its ancestors.

## Reflog and multiple commits

Open **Repository Tools → Reflog & Recovery** to inspect local branch and HEAD movements. **Show in Graph** opens the chosen commit's context, including commits no longer on a branch. **Create Recovery Branch** keeps that commit under a new branch without checking it out. Reflog availability follows Git's local retention and pruning.

Ctrl/Cmd-click selects individual commits; Shift-click selects a range. Select up to 100 commits for **Cherry-pick Selected** or **Revert Selected**. Review and adjust the execution order before confirming. Cherry-picks default to oldest first; reverts default to newest first. Merge commits require a common mainline parent choice. The native Git sequencer retains remaining commits if a conflict interrupts the batch; use the status strip's Continue, Abort, or Skip controls.

## Keyboard navigation and activity

Arrow keys move between commit rows; Home/End move to the first/last loaded row. Enter opens details, Space selects, and Shift+F10 opens actions. Ctrl/Cmd+F or `/` focuses history search when no dialog is active. Repository switches preserve filters and scroll position.

Running operations show their repository, action, and elapsed time. **Hide** closes the progress dialog while Git continues. **Git Activity** retains the last 100 operations from this view, including results that arrive after switching repositories or opening another dialog. Errors have selectable output and **Copy Error Details**. This activity list lasts for the current graph view; it is separate from Git's reflog.
