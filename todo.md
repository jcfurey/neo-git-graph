# Outstanding work

Reviewed **2026-09-25**, against `main` at `e96e630`. Five parallel reviews covered the
uncommitted-changes and file-restore features added since the last review, the backend Git layer,
the extension host, the webview, and project health (tests, CI, documentation, and packaging). The
previous backlog, reviewed 2026-09-18 at `5614855`, is complete; its results are recorded in the
[changelog](CHANGELOG.md) and in this file's history.

Check an item off when its acceptance criteria and relevant checks pass and CI is green for the
commit that completes it.

**Evidence:** “Reproduced” means exercised during this review against real Git repositories, the
unit-test harness, or a headless-Chrome build of the webview; “Code review” means the gap is visible
in the implementation but has not been reproduced end to end; “Proposed” and “Investigate” identify
improvements rather than confirmed defects.

## P1 — Data safety, security, and correctness

- [x] **Refuse to restore a file through a submodule or nested repository.** Completed
      2026-09-25. The shared work-tree path check, used by planning, previewing, and restoring,
      rejects a destination whose parent directory contains `.git` or has a gitlink in the index,
      which also covers a submodule that is not checked out. The error asks the user to open that
      repository instead.
      **Verified:** backend tests cover a checked-out submodule, an uninitialized submodule, an
      untracked nested clone, and an ignored nested clone. Planning, preview, and restore each
      reject the destination, and the nested file keeps its uncommitted edits. All four tests fail
      against the previous check.
      Sources: [path checks](src/backend/utils/history.ts),
      [restore plan](src/backend/queries/history.ts), [restore action](src/backend/actions/history.ts).

- [x] **Warn before a restore overwrites local contents that `git status` hides.** Completed
      2026-09-25. The restore plan still honors `git status`, and it now also sets the
      local-changes flag when an existing destination has no stage-0 entry or differs from it:
      files are hashed with `hash-object`, which applies the same filters and line-ending
      conversion as `git add`, and symlinks are compared by target. A destination whose real
      on-disk name differs in letter case or Unicode form from the requested name is flagged.
      **Verified:** backend tests cover skip-worktree and assume-unchanged edits (both fail against
      the previous plan), unchanged files after CRLF conversion, and symlink targets. Case and
      Unicode-form variants assert the flag wherever the filesystem resolves the variant name, which
      the macOS and Windows CI runners exercise.
      Sources: [restore plan](src/backend/queries/history.ts),
      [snapshot](src/backend/utils/history.ts).

- [x] **Read commit-detail file lists with `-z`.** Completed 2026-09-25. Commit details parse
      NUL-delimited `diff-tree` records for names and line counts, including renames, stop at a
      merge's second parent section as before, and report binary files without counts. The
      backslash-to-slash conversion is gone, and revisions follow `--end-of-options`. Working-tree
      index lookups use `:0:<path>`.
      **Verified:** a backend test commits CJK, accented, and (except on Windows) tab, quote,
      newline, backslash, and `0:foo` names plus a rename into a Unicode directory. It asserts exact
      paths and line counts, and that `<commit>:<path>` documents, Open at Revision, File History,
      and restore planning work for each name. A working-tree test shows a staged `0:foo` diffs
      against its own index entry. Merges and empty commits keep their file lists, and the VS Code
      URI round-trip test covers `%`, Unicode, quotes, newlines, and backslashes.
      Sources: [commit details](src/backend/queries/commitDetails.ts),
      [working-tree diffs](src/backend/actions/workingTree.ts).

- [x] **Stop repository ref names from being parsed as Git options.** Completed 2026-09-25. The
      graph filter, branch focus, and history search use the full ref of the selected branch, and
      the graph log ends its revisions with `--`. Tag and branch creation, deletion, and renaming
      pass names after `--`. Merges pass `--end-of-options` and keep the short branch name, so Git
      still records "Merge branch 'name'", unless another ref such as a same-named tag would take
      precedence; then they use the full ref.
      **Verified:** backend tests with `refs/tags/-d`, `refs/heads/--output=x`, and `refs/heads/-D`
      assert the exact ref set after each deletion and rename, that no file is created, that an
      unmerged `-D` still needs force, and that merges and graph filters pick the branch over a
      same-named tag. Eight of the nine tests fail against the previous actions.
      Sources: [commit loader](src/backend/queries/loadCommits.ts),
      [tag actions](src/backend/actions/tag.ts), [branch actions](src/backend/actions/branch.ts),
      [merge](src/backend/actions/merge.ts).

- [x] **Validate `neo-git-graph:` diff URIs before running Git.** Completed 2026-09-25. The
      provider accepts only full SHA-1 or SHA-256 object IDs (a commit may end in `^`), and only
      absolute repositories that this session opened a document for or that have saved graph
      state, so restored editors still load. It passes `--end-of-options` before the revision. The
      all-zero placeholder, malformed escapes, and every rejected URI return an empty document
      without starting Git.
      **Verified:** unit tests cover `--output=`, `-O…`, `--ext-diff`, symbolic and abbreviated
      revisions, a blob with `^`, relative and unknown repositories, and a malformed escape, and
      assert that no Git client is created and an existing file is unchanged. Eight of these tests
      fail against the previous provider.
      Sources: [diff document provider](src/old-extension/diffDocProvider.ts),
      [registration](src/extension/legacy.ts).

- [x] **Neutralize user Git configuration and locale in parsed Git output.** Completed 2026-09-25,
      following Git's own convention instead of a fixed locale: Git translates messages meant for
      people, but not plumbing output, `--porcelain` and `-z` formats, or exit statuses. Users
      therefore keep Git's messages in their language, and the backend never parses message
      text. The simple-git client and `runGit` pass `log.showSignature=false`,
      `status.showUntrackedFiles=all`, and `never` for `color.ui` and the per-command color
      settings. Git hands these to its child processes, which also stops `worktree remove` from
      deleting untracked files that `status.showUntrackedFiles=no` hid. Branch listing reads
      `for-each-ref`, merges judge conflicts by exit status, and repository detection reads
      `rev-parse --is-inside-work-tree` output instead of simple-git's check for English or German
      "not a repository" text. A fixed locale was rejected: simple-git refuses a custom environment
      that contains `EDITOR`, `PAGER`, or `GIT_ASKPASS`, and it would show every user Git's errors
      in English.
      **Verified:** backend tests use the product client, and unit and VS Code tests read
      `tests/fixtures/gitconfig` with `GIT_CONFIG_NOSYSTEM=1`. Linux CI reruns the backend and
      extension suites with `tests/fixtures/hostile.gitconfig` and German Git messages, and fails
      if Git's messages are not German. A signed-commit test covers the graph, details, history,
      sync and batch plans, rebase messages, and bisect subjects; without the overrides the graph
      loads no commits. Tests assert Git's failures by behavior rather than English wording, and
      the `LANG` pin is gone. All 287 backend and extension tests pass locally in German.
      Sources: [Git client](src/backend/gitClient.ts), [runGit](src/backend/utils/runGit.ts),
      [test helpers](tests/backend/helpers.ts).

- [x] **Stop a held Enter key from confirming destructive dialogs.** Completed 2026-09-25.
      Dialogs ignore repeated Enter and Space keydowns (text areas excepted), and menus no longer
      run an item on a repeated key. Destructive confirmations open with focus on Cancel: branch,
      tag, and remote ref deletion, reset, stash drop, remote and worktree removal, abort and skip,
      bisect reset, and branch cleanup.
      **Verified:** a VS Code UI test sends auto-repeating Enter key events from Delete Tag, Delete
      Branch, Reset, and Delete Remote Branch (through the remote picker). It asserts that no ref or
      HEAD changes and that Cancel has focus, and that a fresh Enter on the confirm button still
      deletes. Against the previous webview, the held Enter deleted the tag. Webview unit tests
      cover every destructive confirmation's focus, repeated keys in menus, and text areas.
      Sources: [dialog](src/webview/components/ui/Dialog.tsx), [menus](src/webview/lib/menus.tsx).

- [x] **Never delete a remote branch using another remote's name.** Completed 2026-09-25. Delete
      Remote Branch on a ref whose remote is not configured explains that and posts nothing.
      Checkout suggests the part of the ref after its own remote, or after its first segment when
      the remote was removed, and leaves fetching off for such refs. The backend then creates the
      local branch without tracking instead of failing.
      **Verified:** webview tests cover plain and slash-containing removed remotes, a configured
      slash-containing remote (`team/mirror`, which also shadows `team`), and a repository with no
      remotes. A backend test checks out `team/mirror/topic` after its remote is gone and refuses to
      fetch it. Six of the new tests fail against the previous code.
      Sources: [remote actions](src/webview/lib/remote-actions.tsx),
      [branch actions](src/backend/actions/branch.ts).

- [x] **Accept every `git.path` value VS Code accepts.** Completed 2026-09-25. One resolver
      prefers the path that VS Code's Git extension found, looked up without blocking activation,
      then the `git.path` setting, whose array form resolves to its first existing entry.
      simple-git's binary check is lifted for this trusted path, and the warning it would log for
      every client is silenced, so a path with spaces or parentheses no longer throws.
      **Verified:** a backend test loads the graph and scans for repositories through a Git
      executable whose path contains spaces (and, except on Windows, parentheses); without the
      fix the client throws the reported error. Resolver tests cover strings, empty values,
      arrays with and without an existing entry, and the default. Activation is covered through
      the client construction that used to throw; no VS Code test sets `git.path`.
      Sources: [configuration](src/extension/config.ts), [Git client](src/backend/gitClient.ts),
      [portable-Git hint](src/old-extension/l10n/webviewL10n.ts).

- [x] **Activate with missing repositories, missing folders, or no folder.** Completed 2026-09-26.
      Activation no longer creates a Git client for the saved last-active repository, which was
      only ever used to set its path, and it reads no saved repository paths. Commands register
      even without a workspace folder, and the graph then shows its no-repository page. Repository
      scanning skips, and logs, folders without a local path and folders that are not readable
      directories, so one missing folder no longer hides the others. Saved state for repositories
      whose folders are gone is pruned when the Workspace pane loads. The manifest declares
      virtual and untrusted workspaces unsupported, as VS Code's own Git extension does, because
      Git needs local files and can run programs named in repository configuration.
      **Verified:** activation tests register all six commands without a folder and with a
      deleted last-active repository, create no Git client, and check the manifest; all three fail
      against the previous activation. A scan test finds the real repository beside a deleted and
      a virtual folder, and a repository-manager test prunes only missing paths.
      Sources: [activation](src/extension/legacy.ts), [entry point](src/main.ts),
      [repository scan](src/extension/handlers/scan-repo.ts), [manifest](package.json).

- [x] **Stop background reads from locking the index or hiding repository changes.** Completed
      2026-09-25. Every backend Git process runs with `--no-optional-locks`, which simple-git
      accepts as a binary prefix; its safety checks reject `GIT_OPTIONAL_LOCKS` alongside common
      variables such as `EDITOR`. The bridge no longer mutes the watcher for every message. Only
      actions that change a repository mute it, only for that repository, its parents, and its
      submodules, and actions that just open an editor do not mute it.
      **Verified:** a backend test gives a tracked file a new modification time, runs the graph,
      state, and workspace queries, and asserts the index is byte-for-byte unchanged, while a plain
      `git status` rewrites it; the test fails without the option. Watcher tests show a commit
      made just after a read refreshes the graph, and cover overlapping, other-repository, parent,
      and submodule mutes. Action tests assert a push mutes its own repository until it settles
      and a file view does not mute.
      Sources: [webview bridge](src/old-extension/webviewBridge.ts),
      [repository watcher](src/extension/watchers/git-repo.watcher.ts),
      [bridge tests](tests/extension/webviewBridge.test.ts).

- [x] **Make the destructive-action backend tests independent and specific.** Completed
      2026-09-26. The commit, branch, tag, and merge action tests (twelve files) use a new
      `freshRepo()` helper that builds a repository for every test. Each test asserts the exact
      refs, commits, index, or files it expects, and that failures leave the repository unchanged.
      The duplicate-tag test creates its own tag.
      **Verified:** the full backend suite passes shuffled with seeds 1–5 (seeds 2 and 3 failed
      before), and Linux CI adds a shuffled run with a random seed. The reset tests assert HEAD,
      the index, and the working tree for each mode, and the mutant that runs mixed for hard and
      soft for mixed now fails two of them.
      Sources: [reset tests](tests/backend/actions/commit/reset.test.ts),
      [tag tests](tests/backend/actions/tag/add.test.ts),
      [branch tests](tests/backend/actions/branch/delete.test.ts).

- [x] **Test the classic destructive actions from menu to Git, including the repository lock.**
      Completed 2026-09-26. Webview tests open every commit, tag, local-branch, and remote-branch
      menu entry, submit non-default choices in the tag, branch, checkout, merge, reset, rename, and
      delete dialogs, and assert the exact request, including the destructive flag. A table-driven
      extension test maps each action command to its backend function and repository, and lock
      tests cover the same repository, descendants of a running submodule action, a submodule
      action refused while a submodule below it is busy, and release after an error.
      **Verified:** `menus.tsx` function coverage rose from 39% to 95%, and CI now fails below 80%
      (`pnpm run test:coverage`). Removing either the descendant check or the lock release makes
      the lock tests fail. The existing `historyDocuments` VS Code test round-trips diff URIs whose
      paths contain spaces, `#`, `%`, `?`, a tab, Unicode, quotes, a newline, and `\`.

## P2 — Robustness, coverage, and maintainability

### Git backend and repository discovery

- [x] **List branches with `for-each-ref` instead of parsing `git branch`.** Completed
      2026-09-25. The branch query, checkout's existing-branch check, and remote renames read
      `for-each-ref refs/heads refs/remotes`, skipping symbolic refs such as `origin/HEAD`, and the
      head comes from `symbolic-ref --quiet HEAD`.
      **Verified:** tests cover a conflicted rebase, a bisect, and HEAD detached at a branch tip, a
      tag, and a hash, with forced branch color and a remote HEAD. Each asserts a null head and the
      exact branch list; six of them fail against the previous query. The existing tests assert
      exact lists, the `LANG` pin is gone, and a checkout test fast-forwards an existing branch
      despite colored `git branch` output.
      Sources: [branch query](src/backend/queries/loadBranches.ts),
      [branch actions](src/backend/actions/branch.ts),
      [remote actions](src/backend/actions/remotes.ts).

- [x] **Detect merge conflicts from Git's exit status.** Completed 2026-09-25. Merges run through
      `runGit`, which reports Git's exit status, with `--no-edit`. When a merge fails and
      `MERGE_HEAD` exists, the user sees a localized message that points to the status strip's
      Continue and Abort; other failures keep Git's own message.
      **Verified:** tests merge a branch and a commit into a conflict with English output and,
      except on Windows, with a Git wrapper that translates the conflict text. Both reject with
      the localized message and leave `MERGE_HEAD` for resolution, and both fail against the
      previous merge. Another test keeps Git's message for a merge that would overwrite local
      changes, and the VS Code merge-recovery scenario passes.
      Sources: [merge](src/backend/actions/merge.ts).

- [x] **Make backend ref-name validation reject invalid names.** Completed 2026-09-26.
      `check-ref-format` reports an invalid name only through its exit status, which simple-git
      ignores when stderr is empty, so validation asks for `--normalize`, which prints the name
      only when it is valid, and also refuses names Git would rewrite, such as `a//b`. Branch
      creation and rename, tag creation and push, remote names, remote ref deletion, and the lease
      query all validate before running Git, with localized branch, tag, and remote messages.
      **Verified:** tests reject `a..b`, `*`, `x@{1}`, `has space`, `a:b`, `.hidden`, `a//b`,
      `end/`, and `x.lock` in each of those paths and assert that no local or remote ref changed;
      HEAD and option-like branch names and invalid remote names are rejected too. Eleven of the
      tests fail against the previous validation, and the remote push test now expects the
      validation message rather than Git's later rejection.

- [x] **Parse graph log records with NUL delimiters and report malformed records.** Completed
      2026-09-26. The commit loader runs `git log -z` with NUL-separated fields, like the history
      query, and refuses output that is not whole records, has a malformed hash, or has a
      non-numeric date, so the graph shows its error view instead of a truncated history. Root
      commits now have no parents instead of one empty parent.
      **Verified:** a four-commit test with carriage returns in a subject and an author name loads
      every commit with Load more available; unit tests reject a missing terminator, a short
      record, a partial second record, a bad hash, and a bad date; and a malformed `log` output
      rejects `loadCommits`. All four tests fail against the previous loader.

- [x] **Identify repositories by their real Git top level.** Completed 2026-09-26. Discovery maps
      each folder inside a work tree to the real path of `rev-parse --show-toplevel`, and the
      picker and the Workspace pane now share that one cached scanner. SCM clicks resolve through
      the same function, with the latest click winning, and File History uses the folder's
      `--show-prefix`, so a file opened through a symlink still maps to its repository path.
      **Verified:** tests cover a workspace folder at a subfolder and at a symlink (a junction on
      Windows), both of which list the repository once; `workTreeRoot` maps the repository, a
      subfolder, and a symlink to one path and returns null inside `.git` or outside a work tree;
      an SCM click on a subfolder selects the top level; and File History through a symlink opens
      `sub dir/file #1.txt` in the real repository. The subfolder, symlink, and File History tests
      fail against the previous discovery.

- [x] **Watch the real Git directories of worktrees and submodules.** Completed 2026-09-26. On
      selection, the watcher resolves `--absolute-git-dir` and `--git-common-dir` and watches
      HEAD, the index, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_*`,
      `rebase-merge/`, `rebase-apply/`, and `sequencer/` in the Git directory, and `config`,
      `packed-refs`, and `refs/**` in the common directory, besides the work tree. A slow lookup
      for a repository that is no longer selected adds no watchers.
      **Verified:** tests commit in a real linked worktree and a real submodule, check that none of
      the Git files the commit touched is below the work tree, and report those files to the
      watchers: each commit produces exactly one refresh. A `MERGE_HEAD` refreshes, while new
      objects, another worktree's HEAD, and the main worktree's HEAD do not. All four tests fail
      against the previous watcher.

- [x] **Follow workspace-folder changes and stop listing every repository ever viewed.**
      Completed 2026-09-26. Workspace-folder changes and `.git` creations or deletions invalidate
      the scan and ask the webview to rescan, which keeps the current list on screen until the
      new one arrives. The scan, not the event, decides what is listed, so live discovery respects
      `maxDepthOfRepoSearch`. Picker and Workspace rows are the scan plus repositories opened this
      session from Source Control or File History while their `.git` exists; saved state no longer
      adds rows and is still pruned for deleted folders.
      **Verified:** tests show folder changes and deep `.git` events send a rescan rather than a
      direct add, a repository with only saved state is not a Workspace row, the selected
      repository is always included, and a session repository drops out once its `.git` is gone.
      Each of these tests fails against the previous code. The unused repository-manager add,
      remove, and replace functions and the `repo.changed` notification are removed.

- [x] **Keep hidden-remote exclusions within Windows command-line limits.** Completed
      2026-09-26. `git log` now gets one `--exclude=<remote>/*` per hidden remote before
      `--remotes`. Git has no re-include, so a visible remote named below a hidden one is added
      back with `--glob=refs/remotes/<remote>/*`, after excluding hidden remotes named below it.
      Remote names are escaped as literal patterns. The per-ref set still filters labels.
      **Verified:** a test builds 2,000 branches of a hidden `upstream` remote plus a visible
      `upstream/mirror` and a hidden `upstream/mirror/private` below it. The graph matches
      `git rev-list` of the local refs and visible tips exactly, shows only the visible remote
      labels, and its `log` command line is under 500 characters, where the previous exclusions
      took 61,084 and the test fails. The test runs in Windows CI too, and the existing nested and
      orphan remote tests pass unchanged.

- [x] **Let long network actions time out or be cancelled.** Completed 2026-09-26. Push, pull,
      fetch, tag push, remote ref deletion, fetch-before-checkout, fetch after adding a remote,
      and workflow pushes run through `runGit`, which always sets `GIT_TERMINAL_PROMPT=0` and
      takes the Git path and abort signal from the client that started the action. The running
      dialog of these actions offers **Stop Git**; the extension aborts that action's
      controller, which stops Git and every process it started (its process group on POSIX,
      `taskkill /T` on Windows, where `Git\cmd\git.exe` is only a launcher), reports "The Git
      operation was cancelled.", and releases the repository lock. There is no automatic timeout, since a large fetch can be
      silent for a long time.
      **Verified:** backend tests start a fetch and a push over a `core.sshCommand` that records
      `GIT_TERMINAL_PROMPT` and sleeps: with the variable cleared from the test environment, Git
      sees `0`, which fails against the previous code, and aborting ends each within five
      seconds without creating refs and, on Linux and macOS, stops the SSH command's shell, which
      the first version left running; on Windows the repository can then be removed. An extension test stops a stalled push through
      `cancelAction`, shows that another request id does not stop it and that the repository is
      busy until then, and then deletes a tag in the same repository. Webview tests show Stop
      Git for network actions only and check the message it posts.

### Uncommitted changes and restore

- [x] **Let read-only file views run while other views are open.** Completed 2026-09-26. File
      views and restore previews no longer take the repository lock or mute the watcher, while
      mutations keep both. Opening a working-tree change is logged as "Open File Changes"; the
      other views already had their own titles.
      **Verified:** an extension test holds one view and a reset open, runs every other view kind
      alongside them without a busy error, and then runs a tag deletion once the reset ends while
      the view is still pending; it fails against the previous lock. A webview test checks the
      activity title of each view kind.

- [x] **Make a file restore recoverable and account for unsaved editors.** Completed 2026-09-26.
      Before a restore replaces different contents, the backend stores them with
      `hash-object -w --no-filters --stdin`, so the Git object holds the exact bytes, with the
      mode and whether the file was a symlink. Once the restore has released the repository lock,
      a notification offers Undo Restore, which runs through the lock, puts the bytes and mode
      back, and refuses when the file changed after the restore, naming the object. A restore or
      undo is refused while an editor has unsaved changes to the file, and the preview warns
      that it shows them.
      **Verified:** backend tests restore over bytes with CR, LF, NUL, and invalid UTF-8 in an
      executable file, check the stored object byte for byte, and undo to the same bytes and
      mode; no backup is made for a missing or identical file; and undo refuses after later edits
      and leaves them. Extension tests refuse a restore over a dirty editor, warn on its preview,
      undo from the notification, and leave the restore when it is dismissed. The notification
      test caught Undo running while the restore still held the lock, which the follow-up now
      avoids.

- [x] **Open conflicted files when VS Code's Git extension does not track the repository.**
      Completed 2026-09-26. The conflict effect now carries Git's two-letter status. The extension
      opens the merge editor only for `UU` and `AA` conflicts in repositories that the Git
      extension's API reports; otherwise it opens the file, and when neither side kept the file,
      as in `DD`, it explains how to resolve the conflict.
      **Verified:** backend tests build `UD`, `DU`, `AU`, `UA`, `AA`, `UU`, and `DD` conflicts in
      the index and check the status the working-tree list, the file view, and the conflict
      action report. Extension tests cover the merge editor for tracked `UU` and `AA`, the file for
      an untracked repository, a disabled or missing Git extension, and one-sided conflicts, and
      the explanation for `DD`.

### Webview

- [x] **Show failures of hidden or superseded Git operations.** Completed 2026-09-26. A failure
      whose running dialog was hidden, replaced by a newer dialog, or closed by a repository switch
      is marked unseen, and the header shows "Failed Git operations: n" beside the running
      indicator until Git Activity is opened. It never opens over a newer dialog. The dialog
      backdrop also ignores the second click of the double-click that opened it.
      **Verified:** webview tests fail a fetch after hiding its dialog, after a repository switch,
      and under a newer error dialog: each leaves the cue, the newer dialog stays, and opening the
      cue shows Git Activity and clears it. A failure shown in its own dialog adds no cue, and a
      backdrop click with `detail` 2 keeps the dialog open. The four behavior tests fail against
      the previous handling.

- [x] **Render commits with out-of-range dates.** Completed 2026-09-26. The date formatters
      return a localized "Unknown date" when a timestamp does not fit in a JavaScript date, and an
      error boundary around the graph and around dialogs replaces only the failing part with its
      error and Try Again.
      **Verified:** tests format `@99999999999999`, its negative, NaN, and Infinity in all three
      date formats and in the details view, render a graph whose first commit has such a date
      with every row present, and show that a throwing child leaves its siblings and recovers on
      Try Again. The formatter and graph tests fail against the previous code.

- [x] **Keep the Branches pane and branch dropdown responsive with thousands of refs.** Completed
      2026-09-26. Each row subscribes to a computed "my menu is open" signal instead of the shared
      active source, so opening a menu re-renders only the rows it affects. Local branches, each
      remote's branches, and tags render 200 rows with Show more, and the branch dropdown renders
      the page of 200 matches that holds the active option, paging with the arrow keys, with a
      count of the rest.
      **Verified:** `RefsScale.test.ts` renders 3,000 of each ref and asserts one page per list,
      Show more, one re-rendered row when a menu opens and two when it moves, bounded rows for a
      filter keystroke, and 200 of 10,000 dropdown options with End reaching the last one; all
      four fail against the previous code, which re-rendered 9,001 rows per menu. The
      performance report adds jsdom medians at 3,000 and 10,000 refs: opening a menu fell from
      286 and 3,034 ms to about 1 ms, and clearing the filter from 4.3 and 44 s to 93 and 95 ms.

- [x] **Give dialog selects without a label an accessible name.** Completed 2026-09-26. `Select`
      now accepts and forwards `aria-labelledby`, so an unlabelled choice is named by the dialog's
      question.
      **Verified:** Dialog tests open Reset and the cherry-pick and revert parent choice of a merge
      and resolve the select's `aria-labelledby` to the question's text; all three fail without
      the fix.

### Maintenance and project health

- [x] **Remove the unreachable avatar pipeline.** Completed 2026-09-26. The avatar manager
      (with its hard-coded token), the `fetchAvatar` messages and types, the avatar storage, the
      Clear Avatar Cache command, and the unused `fetchAvatars` webview option are removed.
      Activation deletes the old `avatars` folder and cache once. The deprecated setting stays so
      existing settings are not flagged, described as having no effect, and the README no longer
      lists avatars. `src/old-extension` keeps its name, since renaming it would touch every
      import for no behavior change.
      **Verified:** an activation test registers every command without Clear Avatar Cache and
      removes an existing avatar folder and cache entry. New RPC server tests cover a known
      method, unknown methods including `toString` and `__proto__`, handlers that throw an Error
      or another value, and non-RPC messages.

- [x] **Keep `main` green and require CI before checking off work.** Completed 2026-09-26 in
      code; the ruleset is a repository setting that needs an administrator (see the hand-off
      notes in the pull request). The two 400 ms sleeps after Refresh now poll for the graph
      state they waited for: the reset commit gone, and the new branch label present. CI runs
      nightly at 05:23 UTC, and the nightly Linux job also runs the VS Code suite against VS Code
      Insiders, so drift in stable or upcoming VS Code shows up between pushes. From this batch
      on, checked-off items were pushed and followed until the three test jobs passed.
      **Remaining (settings):** a ruleset on `main` requiring `lint (24)`,
      `test (ubuntu-latest)`, `test (macos-latest)`, and `test (windows-latest)`.

- [x] **Harden the release workflow and make it dry-runnable.** Completed 2026-09-26 in code; the
      environment and its secrets are repository settings (see the hand-off notes). The deploy job
      runs in `environment: release` and verifies both tokens with `vsce verify-pat` and
      `ovsx verify-pat` before either publish. A `workflow_dispatch` run is a dry run: it validates
      the manifest version as `v<version>`, runs CI, downloads and checks the VSIX, and verifies
      the tokens, but the publish steps run only for pushed tags. `pnpm/setup` is pinned to the
      v2.1.0 commit SHA in both workflows, the artifact actions are `upload-artifact@v7` and
      `download-artifact@v8` with retention of 14 or 30 days, and actionlint 1.7.12 reports
      nothing. The packaging guide describes the environment and the dry run.
      **Remaining (settings):** create the `release` environment with a required reviewer, and
      move `VS_MARKETPLACE_TOKEN` and `OPEN_VSX_TOKEN` into it as environment secrets.

- [x] **Align the fork's GitHub settings with its documentation.** Completed 2026-09-26 in code;
      Issues and Dependabot are repository settings (see the hand-off notes). CODEOWNERS now names
      `@jcfurey`. `pnpm-workspace.yaml` overrides the vulnerable development dependencies with
      patched releases: js-yaml 4.3.2+, qs 6.16+, vite 8.0.16+, and serialize-javascript 7.1+,
      the version mocha 12 itself requires. `pnpm audit` now reports one low advisory, `diff`
      under mocha 11, whose fix needs a mocha major version that `@vscode/test-cli` does not
      accept yet. Tests, type checks, and both builds pass with the new versions.
      **Remaining (settings):** enable Issues, which the manifest, README, and issue templates
      link to, and enable Dependabot alerts and security updates so `dependabot.yml` takes effect.

- [ ] **Version the changelog and keep release bookkeeping consistent.** The changelog is headed
      Unreleased, although the manifest and docs say 0.9.6, so the installed extension's changelog
      shows Unreleased. e96e630's restore-preview fix is missing from it. The local 0.9.6 VSIX
      predates e96e630, so two different builds carry the same version, and the version is copied
      by hand into the README, the packaging guide, and the changelog.
      **Accept:** a dated version heading exists, with Unreleased above it. e96e630 is listed, and
      post-0.9.6 changes get a version bump. Optionally, `check:release` fails when the changelog
      has no heading for the manifest version.
      Sources: [changelog](CHANGELOG.md), [packaging guide](docs/packaging.md),
      [release check](scripts/check-release.cjs).

- [ ] **Ship every document the in-product guide links to.** The guide that Learn more opens links
      to `performance.md` from a contributor-only validation section, but the VSIX excludes that
      file. The walkthroughs do not mention branch focus, per-remote visibility, or uncommitted
      changes, and the Branches pane walkthrough still describes a single eye button.
      **Accept:** the package test fails on any relative link in shipped Markdown that does not
      resolve. The user guide has no developer-only section. The walkthroughs cover focus and remote
      visibility.
      Sources: [package exclusions](.vscodeignore), [user guide](docs/git-actions.md),
      [walkthroughs](walkthroughs), [package smoke test](scripts/package-smoke.cjs).

- [ ] **Document a setup for the pinned pnpm without Nix, and fix stale editor tasks.** pnpm is
      provided only by the Nix development shell. `corepack pnpm` works, but it aborts in
      non-interactive shells when `node_modules` records a store directory that no longer exists.
      `.vscode/tasks.json` references scripts that do not exist.
      **Accept:** the docs give `corepack enable pnpm` as the setup step. After a frozen reinstall,
      `pnpm run format`, `pnpm test`, and `pnpm run typecheck` work without a terminal. Tasks
      reference only existing scripts. Optionally, a `clean:all` script removes `.vscode-test/` and
      old VSIX files.
      Sources: [testing guide](docs/testing.md), [packaging guide](docs/packaging.md),
      [editor tasks](.vscode/tasks.json).

## P3 — Optional usability and performance improvements

- [ ] **Keep the uncommitted-changes list, focus, and scroll position across refreshes.** Every
      watcher refresh, including one caused by auto-save, hides the list while it reloads.
      **Reproduced:** with focus on the 30th of 50 files, a refresh emptied the list and left focus
      on the page body; 20,000 untracked files took 1.4 s to render in jsdom.
      **Accept:** the previous list stays visible during a refresh, and focus is kept by group and
      path, with a test. Large groups are capped with Show more, and the timing is added to the
      performance report.
      Sources: [working-tree details](src/webview/components/commit/WorkingTreeDetails.tsx),
      [query hook](src/webview/lib/use-repository-query.ts).

- [ ] **Let the restore dialog recover from a stale preview.** If the file changes after planning,
      including through edits in the preview itself, both buttons fail with "Preview the restore
      again", but Preview resends the same stale plan. **Reproduced** in the backend; the UI part is
      **Code review.**
      **Accept:** a snapshot mismatch re-plans with the same source and destination and shows the
      updated local-changes state. A webview test covers this.
      Sources: [restore dialog](src/webview/components/history/HistoryTools.tsx).

- [ ] **Explain untracked nested repositories in the uncommitted-changes list.** An untracked nested
      repository is listed as `nested/`, and clicking it fails with "Choose a file path inside the
      repository." **Reproduced.**
      **Accept:** the entry is shown as a nested repository and opens an explanation or the folder.
      A backend test covers it.
      Sources: [working-tree query](src/backend/queries/workingTree.ts).

- [ ] **Batch per-item Git processes.** **Reproduced:** renaming a remote with 1,000 local branches
      took 11.4 s under the repository lock, because each branch's push default is updated
      separately (`git remote rename` alone took 3 ms). The rebase plan for 500 commits took
      1.23 s, against 7 ms for a single `log -z`, and batch plans run two processes per commit.
      **Accept:** these operations use `config --get-regexp` and single `log -z` calls, and
      renaming a remote with 1,000 branches takes under 1 s.
      Sources: [remote actions](src/backend/actions/remotes.ts),
      [repository queries](src/backend/queries/repository.ts),
      [history query](src/backend/queries/history.ts).

- [ ] **Open keyboard-activated menus next to their button.** Menus opened with Enter from the
      Branches pane, the settings cog, and the Workspace pane use zero mouse coordinates, so they
      appear in the window's corner. **Reproduced.** Commit rows and file trees already anchor
      their menus to the button.
      **Accept:** keyboard activation anchors the menu to the button's rectangle, with a test.
      Sources: [context menu actions](src/webview/lib/actions.ts).

- [ ] **Keep dropdowns and the sidebar inside narrow windows.** **Reproduced:** at 400 px wide, the
      Branch dropdown list extends 157 px past the left edge. When the header wraps (at 800–1000
      px), the sticky sidebar ignores the measured header height, and its top 36 px sit under the
      header.
      **Accept:** dropdowns flip or clamp to the viewport, and the sidebar uses the measured header
      height. UI checks run at 400 and 800 px.
      Sources: [dropdown](src/webview/components/ui/Dropdown.tsx), [app layout](src/webview/App.tsx).

- [ ] **Keep keyboard focus in list editors and give each row's controls a distinct name.**
      **Reproduced:** moving an entry in the interactive rebase or batch editors sends focus to the
      page body and announces nothing, and a background refresh drops focus from the sync preview.
      The Branches pane's ⋯ and Checkout buttons do not say which row they belong to, and the ⋯
      buttons of a local and a remote branch with the same name are identical.
      **Accept:** focus follows the moved entry, and a live region announces its new position.
      Controls are named with their commit or full ref. Consider roving focus for Branches pane
      rows.
      Sources: [rebase editor](src/webview/components/repository/RebaseEditor.tsx),
      [Branches pane](src/webview/components/repository/RefsPane.tsx),
      [workflow tools](src/webview/components/history/WorkflowTools.tsx).

- [ ] **Localize the remaining hard-coded webview text.** Still hard-coded: "Loading ...", the
      repository-load failure and its Retry button, reflog dates (which use the browser locale),
      activity durations with a raw "s", RPC timeout messages, and `<html lang="en">`.
      **Code review.**
      **Accept:** these strings come from l10n and `Intl`, and a lint or test flags JSX text
      literals in the webview.
      Sources: [loading indicator](src/webview/components/ui/Loading.tsx),
      [webview entry point](src/webview/main.tsx), [HTML shell](src/extension/html.ts).

- [ ] **Apply setting changes to an open graph and constrain numeric settings.** Display settings
      are read once when the webview starts, so changes made from the settings cog have no effect
      until the graph is reopened. Numeric settings accept fractions and negative numbers:
      `initialLoadCommits: 300.5` makes every load fail, and `-1` loads the entire history.
      **Code review,** plus a check with Git.
      **Accept:** configuration changes reach the webview and refresh the graph. The manifest
      declares integer types with minimums, and the configuration reader clamps values. Tests cover
      both.
      Sources: [configuration watcher](src/extension/watchers/config.watcher.ts),
      [configuration](src/extension/config.ts), [manifest](package.json).

## Suggested next batch

Start with the items that can lose work or run unintended Git commands; they are small and
independent. First, validate diff URIs and stop ref names from being parsed as options. Next,
refuse restores through nested repositories and detect local contents that `git status` hides.
Then stop a held Enter from confirming destructive dialogs and fix the remote-branch deletion
target.

The configuration and locale item, the `-z` parsing item, and branch listing with `for-each-ref`
share one theme, making parsed Git output independent of user settings, and could land together.
The two P1 test items should come before, or alongside, any changes to the destructive actions they
protect.
