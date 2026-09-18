# Outstanding work

Reviewed **2026-09-18**, against `main` at `5614855`. This backlog is based on the code and tests
in this checkout. Check an item off when its acceptance criteria and relevant checks pass.

Branch focus and dimming, individual remote visibility, graph clipping, and horizontal graph
scrolling are already implemented. The items below address remaining gaps and refinements.

**Evidence:** “Reproduced” means exercised during this review; “Code review” means the gap is
visible in the implementation but has not been reproduced end to end; “Proposed” and
“Investigate” identify improvements rather than confirmed defects.

## P1 — Correctness and regression protection

- [x] **Include detached HEAD in the all-branches graph.** Completed 2026-09-18. The all-branches
      query now includes the resolved HEAD hash, so detached-only history and its dirty row stay
      visible. Branch filtering and hidden remote labels retain their existing behavior.
      **Verified:** regression tests cover detached-only commits with remotes shown/hidden, dirty
      detached checkouts, no branch refs, checked-out hidden remote history, and an unborn repo.
      Sources: [commit loader](src/backend/queries/loadCommits.ts),
      [existing loader tests](tests/backend/queries/loadCommits/list.test.ts).

- [x] **Reject superseded graph, branch, and commit-details replies.** Completed 2026-09-18.
      Requests and replies now carry an ID and repository; handlers accept only the latest pending
      reply. Closing details or changing repositories invalidates pending replies. The extension
      cancels superseded reads and outstanding reads on repository switches or panel disposal.
      **Verified:** reordered replies cannot undo Load more, overwrite refreshes, or close another
      commit's details; tests include returning to the same repository/visibility and current errors.
      Sources: [commit handler](src/webview/lib/handler/load-commits.ts),
      [branch handler](src/webview/lib/handler/load-branches.ts),
      [details handler](src/webview/lib/handler/commit-details.ts),
      [existing cancellable query hook](src/webview/lib/use-repository-query.ts).

- [x] **Distinguish graph loading failures from empty history.** Completed 2026-09-18. Branch,
      commit, ref, remote-visibility, and status failures now reach the view with request identity.
      A localized error view offers Retry and preserves the normal empty state for unborn repos.
      **Verified:** removed repositories, invalid revisions/executables, failed Git reads, stale
      errors, and recovery through Retry are covered by backend, extension, and webview tests.
      Sources: [commit loader](src/backend/queries/loadCommits.ts),
      [message handlers](src/old-extension/messageHandler.ts).

- [x] **Preserve remote visibility when renaming or removing a remote.** Completed 2026-09-18.
      Successful remote actions migrate or remove saved preferences and update the view. Opening
      the graph restores its saved repository preferences. Successful state refreshes prune missing
      groups, retaining configured remotes and orphan groups with tracking refs. External renames
      are treated as new visible groups; Git does not provide a reliable rename mapping.
      **Verified:** exact names containing slashes, failed actions/refreshes, removal and re-addition,
      external changes, panel restoration, and preserving unrelated column widths are covered.
      Sources: [remote actions](src/backend/actions/remotes.ts),
      [visibility preferences](src/webview/lib/actions.ts),
      [repository action handler](src/old-extension/messageHandler.ts).

- [x] **Run the existing webview-bridge tests.** Completed 2026-09-18. Moved the tests into the
      extension test project and added real watcher behavior checks using controlled timers.
      **Verified:** listener disposal, error propagation, and watcher recovery after failed and
      overlapping handlers are covered by the normal test runner.
      Sources: [test configuration](vitest.config.ts),
      [bridge tests](tests/extension/webviewBridge.test.ts),
      [bridge](src/old-extension/webviewBridge.ts).

## P2 — Packaging, coverage, and maintainability

- [x] **Make fork packaging repeatable.** Completed 2026-09-18. The manifest now identifies
      `jcfurey.neo-git-graph@0.9.5` and links to the fork. `pnpm run package:vsix` builds it without
      manifest overrides; extension tests derive their identity from the manifest.
      **Verified:** a fresh source copy with a locked dependency install builds the VSIX. An
      isolated VS Code test upgrades an older fork without a duplicate, checks packaged assets,
      activates the installed extension, and opens its graph, guide, and walkthrough.
      Sources: [manifest](package.json), [packaging guide](docs/packaging.md),
      [package test](scripts/test-package.cjs).

- [x] **Gate publishing on validation of the release commit.** Completed 2026-09-18. Tag pushes
      validate the fork identity/version and invoke the full CI workflow from the release commit.
      Publishing depends on all checks, downloads the package-tested artifact, verifies its embedded
      identity/version, and publishes that file without rebuilding.
      **Verified:** release guard tests reject wrong identities and mismatched tags; actionlint
      validates both workflows. Live registry publishing has not been run.
      Sources: [publish workflow](.github/workflows/publish.yml),
      [existing three-platform CI](.github/workflows/ci.yaml).

- [x] **Refresh the README and release notes for the fork.** Completed 2026-09-18. Documented
      the 0.9.5 fork build, local installation, focus modes and dimming, individual remote visibility,
      hidden revision lookups, and horizontal graph navigation. The roadmap distinguishes shipped
      behavior from this backlog and the packaging guide explains verification and release gates.
      Sources: [README](README.md), [changelog](CHANGELOG.md).

- [ ] **Expand graph geometry and rendering regression coverage.** **Proposed.** Build on the
      existing wide-graph UI test with focused layout/stroke tests for lane reuse, octopus merges,
      criss-cross merges, and parents beyond the loaded page or a shallow-history boundary.
      Exercise rounded and angular graphs, resizing after scrolling, zoom, and expanded details.
      **Done when:** tests verify lane connections, clipping, and row/details alignment rather
      than only checking that elements exist; commit text remains fixed during lane scrolling.
      Sources: [graph implementation](src/webview/graph),
      [workflow UI tests](tests-ext/ui/history.test.cjs).

- [ ] **Cover theme contrast and keyboard access for the new controls.** **Proposed.** Exercise
      subtle/strong focus dimming and remote visibility in light, dark, and high-contrast themes.
      Check accessible names, visible keyboard focus, and horizontal scrolling at narrow widths.
      **Done when:** focus state and hidden-remote state remain understandable without relying
      only on color, and all new controls work through the keyboard with readable commit text.
      Sources: [commit table](src/webview/components/commit/CommitTable.tsx),
      [refs pane tests](tests/webview/components/repository/RefsPane.test.ts),
      [workflow UI tests](tests-ext/ui/history.test.cjs).

- [ ] **Define and test preference lifetime across reopening and repository switches.**
      **Investigate.** Individual hidden remotes use persisted repository state, focus preferences
      use webview state, and the global remote toggle is an in-memory signal shared across repos.
      Hidden-remote restoration on panel reopening is now implemented and tested.
      Decide which choices should be per repository and survive closing the graph or restarting
      VS Code. Include horizontal scroll position in that decision.
      **Done when:** the chosen behavior is documented and tested across repository switches,
      panel disposal/recreation, and reload; a deleted or renamed focus target has a clear fallback.
      Sources: [navigation persistence](src/webview/lib/navigation.ts),
      [stores](src/webview/lib/stores.ts),
      [graph scroll state](src/webview/components/commit/useGraphScroll.ts).

- [ ] **Measure focus and rendering costs on large repositories.** **Investigate.** Each focus
      query runs two ancestry traversals before filtering to visible hashes, and the commit table
      renders every loaded row. The existing benchmark measures history queries and graph layout,
      but does not measure focus queries or interactive webview rendering.
      **Done when:** repeatable measurements cover focus changes, hidden-remote changes, loading
      more rows, and scrolling. Optimize demonstrated bottlenecks; consider ancestry caching
      with ref-change invalidation or row virtualization only if the results justify them.
      Sources: [focus query](src/backend/queries/branchFocus.ts),
      [commit table](src/webview/components/commit/CommitTable.tsx),
      [benchmark](scripts/benchmark.mjs).

- [ ] **Improve UI failure diagnostics and compatibility checks.** **Proposed.** Failure teardown
      currently saves body text; add failure-time screenshots and webview/extension error logs.
      Keep individual scenarios runnable independently. The harness currently targets stable
      VS Code; add a supported-minimum smoke run when stable differs from the declared minimum.
      **Done when:** a deliberately failing scenario produces useful CI artifacts and passes when
      run alone after the fault is removed; minimum/stable compatibility is explicitly checked.
      Sources: [UI harness](tests-ext/ui/history.test.cjs),
      [VS Code test configuration](.vscode-test.mjs),
      [existing CI artifact collection](.github/workflows/ci.yaml).

## P3 — Optional usability improvements

- [x] **Reveal a selected commit's lane when it is off-screen.** Completed 2026-09-18. Clicking
      or keyboard-navigating to a commit minimally reveals its lane. The **Reveal selected lane**
      button returns to it after manual panning. Refreshes and resizing preserve manual position
      within the available scroll range. Regression and VS Code UI tests cover reveal, keyboard
      access, refresh preservation, and unchanged text position, branch, checkout, and focus mode.
      Sources: [graph scrolling](src/webview/components/commit/useGraphScroll.ts),
      [commit table](src/webview/components/commit/CommitTable.tsx).

- [x] **Keep horizontal graph navigation discoverable deep in history.** Completed 2026-09-18.
      Sticky column headings keep the scrollbar and reveal button beneath the main controls,
      following their measured height when they wrap. UI coverage exercises a deep, wide graph,
      narrow windows, row alignment, keyboard scrolling, and normal vertical wheel handling.
      Sources: [commit table](src/webview/components/commit/CommitTable.tsx),
      [graph scrolling](src/webview/components/commit/useGraphScroll.ts).

## Suggested next batch

Correctness, optional usability, and fork packaging/documentation are complete. Continue with graph
geometry and theme/keyboard coverage, then resolve preference lifetime and measure large-repository
performance. Improve UI failure diagnostics and minimum-version compatibility checks alongside those
tests.
