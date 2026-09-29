# Replacing inherited code

Branchwise began as a fork of [asispts/neo-git-graph](https://github.com/asispts/neo-git-graph),
which continued mhutchie's [Git Graph](https://github.com/mhutchie/vscode-git-graph). The goal is
for Branchwise to contain no code from either project. Until it does, [LICENSE](../LICENSE) keeps
both projects' MIT notices, as their license requires.

## Measuring what is left

```sh
pnpm run provenance
```

This lists, per tracked file, the lines whose origin is an upstream commit: `f8ed5df`, the last
asispts/neo-git-graph commit Branchwise was built on, or any commit before it. Git blame follows
lines moved or copied between files and ignores whitespace changes. Blank lines, punctuation, bare
keywords and imports do not count; code, comments and prose do. Uncommitted changes count as
Branchwise's.

CI runs `pnpm run check:provenance`, which fails when any file has more inherited lines than
[scripts/provenance-baseline.json](../scripts/provenance-baseline.json) records. After replacing
code, lower the baseline in the same change:

```sh
pnpm run provenance --update
```

A rewrite written without sight of the old code can still match it word for word on a few lines:
an exported signature that callers depend on, a `case` for each value of a setting, or a short
generic helper. Blame cannot tell those from copies, so after reviewing them, list them in
[scripts/provenance-reviewed.json](../scripts/provenance-reviewed.json) under the file, with the
rewrite commit and its specification. The count excuses exactly those lines, each as many times as
it is listed; any other upstream line in the file still counts. To see a file's upstream lines,
and which are excused:

```sh
pnpm run provenance --lines src/webview/utils/date.ts
```

The count is a floor, not proof. A line edited beyond recognition counts as Branchwise's even when
the code is still a modified version of upstream's, and code pasted from an old version that is no
longer in the tree is not traced. The rules below are what make a replacement independent.

## Rewriting a module

1. **Specify.** Someone who reads the old module writes a specification of its behaviour to
   `docs/clean-room/<module>.md`: the exported interface, which callers need unchanged; each
   behaviour and edge case in prose; concrete input and output examples observed from the current
   code; non-functional requirements; and which behaviours the tests do not yet cover. The
   specification contains no code, does not follow the old module's structure, and does not reuse
   its comments or wording.
2. **Review the specification** for anything that leaks the old implementation.
3. **Implement.** Someone who has not read the old module writes the replacement from the
   specification and the tests. The old file is deleted before they start, and they do not open
   it, its history, or built output that contains it. They add tests for the gaps the
   specification lists.
4. **Verify and record.** The replacement passes the same checks as any change. The reviewer
   compares it with the old module for anything that looks copied rather than written, and lists
   any reviewed coincidences as described above. The rewrite deletes the old code, lowers the
   baseline, and adds the module to the log below. Inherited tests are
   replaced the same way, with the behaviour they check as the specification.

## Rewording user-interface text

Text the user reads cannot be reimplemented like code, so it is written again in new words:

1. **Specify.** The specification describes each inherited string without quoting it: where it
   appears, what it must tell the user, what fills its placeholders, and what limits its length.
   It also sets out a style guide and glossaries drawn only from Branchwise's own strings and
   translations.
2. **Blank.** Before the writer starts, each inherited string is replaced by a placeholder and its
   translations are removed, so the writer never sees them.
3. **Write.** The writer writes the English and every translation from the specification, then
   updates the tests and documents that quote the old text.
4. **Record.** A common word or a standard term can match the old text exactly ("Cancel", 日期).
   After review, such lines are listed like any other coincidence. The removal and the new text
   are committed together, so that blame can find those matches.

[ui-wording.md](clean-room/ui-wording.md) is the first such rewording. Specifications written
before it quote the wording they were written against.

## End state

When `pnpm run provenance` reports no inherited lines and the logged rewrites cover the modules
that had them, Branchwise moves to a new repository that starts from a fresh first commit, so its
history contains no upstream code either. This repository is then archived as the record of where
the code came from and how it was replaced.

## Rewritten modules

| Module                                                | Specification                                                           | Rewritten in |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| `src/webview/utils/date.ts`                           | [date.md](clean-room/date.md)                                           | `bc67508`    |
| `src/extension/rpc/rpc-server.ts`                     | [rpc-server.md](clean-room/rpc-server.md)                               | `ce0d7bb`    |
| `src/webview/lib/rpc/rpc-handler.ts`                  | [rpc-handler.md](clean-room/rpc-handler.md)                             | `8983b4e`    |
| `src/webview/graph/utils.ts`                          | [graph-utils.md](clean-room/graph-utils.md)                             | `b71ac82`    |
| `src/webview/components/commit/useColumnResize.ts`    | [column-resize.md](clean-room/column-resize.md)                         | `391b9fd`    |
| `src/webview/utils/columns.ts`                        | [columns.md](clean-room/columns.md)                                     | `7b26f2e`    |
| `src/extension/rpc/rpc-notify.ts`                     | [rpc-notify.md](clean-room/rpc-notify.md)                               | `0d7a436`    |
| `src/webview/utils/fileTree.ts`                       | [file-tree.md](clean-room/file-tree.md)                                 | `054fd86`    |
| `src/webview/lib/rpc/rpc-client.ts`                   | [rpc-client.md](clean-room/rpc-client.md)                               | `f488109`    |
| `src/backend/queries/loadCommits.ts`                  | [load-commits.md](clean-room/load-commits.md)                           | `715fa1b`    |
| `src/backend/queries/commitDetails.ts`                | [commit-details.md](clean-room/commit-details.md)                       | `8d063e2`    |
| `src/webview/lib/menus.tsx`                           | [menus.md](clean-room/menus.md)                                         | `cdcd3af`    |
| `src/webview/components/ui/ContextMenu.tsx`           | [context-menu.md](clean-room/context-menu.md)                           | `16805dd`    |
| `src/webview/components/ui/Dropdown.tsx`              | [dropdown.md](clean-room/dropdown.md)                                   | `9cd9e07`    |
| `src/webview/components/ui/Dialog.tsx`                | [dialog.md](clean-room/dialog.md)                                       | `2871b92`    |
| `src/webview/graph/strokes.ts`                        | [strokes.md](clean-room/strokes.md)                                     | `871abc3`    |
| `src/webview/components/commit/FileTree.tsx`          | [file-tree-view.md](clean-room/file-tree-view.md)                       | `6ee2bfb`    |
| `src/webview/lib/actions.ts`                          | [actions.md](clean-room/actions.md)                                     | `b3f9f2f`    |
| `src/webview/graph/layout.ts`                         | [layout.md](clean-room/layout.md)                                       | `f8d9359`    |
| `src/backend/queries/loadBranches.ts`                 | [backend-queries.md](clean-room/backend-queries.md)                     | `39e0d81`    |
| `src/backend/queries/repoSearch.ts`                   | [backend-queries.md](clean-room/backend-queries.md)                     | `39e0d81`    |
| `src/backend/utils/repoSearch.ts`                     | [backend-queries.md](clean-room/backend-queries.md)                     | `39e0d81`    |
| `src/backend/utils/promise.ts`                        | [backend-queries.md](clean-room/backend-queries.md)                     | `39e0d81`    |
| `src/backend/utils/string.ts`                         | [backend-queries.md](clean-room/backend-queries.md)                     | `39e0d81`    |
| `src/extension/util/debounce.ts`                      | [extension-watchers.md](clean-room/extension-watchers.md)               | `69a82f7`    |
| `src/extension/util/logger.ts`                        | [extension-watchers.md](clean-room/extension-watchers.md)               | `69a82f7`    |
| `src/extension/watchers/config.watcher.ts`            | [extension-watchers.md](clean-room/extension-watchers.md)               | `69a82f7`    |
| `src/extension/watchers/git-repo.watcher.ts`          | [extension-watchers.md](clean-room/extension-watchers.md)               | `69a82f7`    |
| `src/extension/watchers/git.watcher.ts`               | [extension-watchers.md](clean-room/extension-watchers.md)               | `69a82f7`    |
| `src/backend/actions/branch.ts`                       | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/backend/actions/commit.ts`                       | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/backend/actions/merge.ts`                        | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/backend/actions/tag.ts`                          | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/backend/gitClient.ts`                            | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/backend/utils/git.ts`                            | [backend-actions.md](clean-room/backend-actions.md)                     | `8c98767`    |
| `src/extension/config.ts`                             | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/html.ts`                               | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/legacy.ts`                             | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/view-command.ts`                       | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/rpc/handlers.ts`                       | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/handlers/clipboard.ts`                 | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/handlers/initialize-repo.ts`           | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/handlers/initialize.ts`                | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/extension/handlers/scan-repo.ts`                 | [extension-core.md](clean-room/extension-core.md)                       | `57ade90`    |
| `src/backend/types/actions.types.ts`                  | [backend-types.md](clean-room/backend-types.md)                         | `f58bcfb`    |
| `src/backend/types/git.types.ts`                      | [backend-types.md](clean-room/backend-types.md)                         | `f58bcfb`    |
| `src/backend/types/queries.types.ts`                  | [backend-types.md](clean-room/backend-types.md)                         | `f58bcfb`    |
| `src/webview/lib/repository-actions.tsx`              | [repository-actions.md](clean-room/repository-actions.md)               | `85afa85`    |
| `src/webview/components/repository/RemoteManager.tsx` | [repository-actions.md](clean-room/repository-actions.md)               | `85afa85`    |
| `src/webview/layout/GraphView.tsx`                    | [app-shell.md](clean-room/app-shell.md)                                 | `78dba45`    |
| `src/webview/layout/MainHeader.tsx`                   | [app-shell.md](clean-room/app-shell.md)                                 | `78dba45`    |
| `src/webview/App.tsx`                                 | [app-shell.md](clean-room/app-shell.md)                                 | `78dba45`    |
| `src/webview/main.tsx`                                | [app-shell.md](clean-room/app-shell.md)                                 | `78dba45`    |
| `src/main.ts`                                         | [app-shell.md](clean-room/app-shell.md)                                 | `78dba45`    |
| `src/webview/components/commit/CommitDetails.tsx`     | [commit-view.md](clean-room/commit-view.md)                             | `40aaca2`    |
| `src/webview/components/commit/CommitTable.tsx`       | [commit-view.md](clean-room/commit-view.md)                             | `40aaca2`    |
| `src/webview/components/commit/CommitRow.tsx`         | [commit-view.md](clean-room/commit-view.md)                             | `40aaca2`    |
| `src/webview/components/commit/CommitGraph.tsx`       | [commit-view.md](clean-room/commit-view.md)                             | `40aaca2`    |
| `src/webview/components/commit/RefLabel.tsx`          | [commit-view.md](clean-room/commit-view.md)                             | `40aaca2`    |
| `src/webview/lib/dispatcher.ts`                       | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/stores.ts`                           | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/stores/repo-list.store.ts`           | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/load-repos.ts`                       | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/webview-config.ts`                   | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/vscode.ts`                           | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/action-result.ts`            | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/load-branches.ts`            | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/load-commits.ts`             | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/commit-details.ts`           | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/view-diff.ts`                | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/handler/refresh.ts`                  | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/lib/actions/clipboard.ts`                | [webview-state.md](clean-room/webview-state.md)                         | `f938e9a`    |
| `src/webview/components/ui/Loading.tsx`               | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/components/ui/Select.tsx`                | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/components/ui/Button.tsx`                | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/components/ui/Icons.tsx`                 | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/components/ui/Checkbox.tsx`              | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/components/ui/ScrollShadow.tsx`          | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/pages/NoRepoPage.tsx`                    | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/pages/NoCommitsPage.tsx`                 | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/pages/LoadingPage.tsx`                   | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/webview/styles.css`                              | [ui-kit.md](clean-room/ui-kit.md)                                       | `d15bfb3`    |
| `src/types/rpc.types.ts`                              | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/types/legacy.ts`                                 | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/types/config.ts`                                 | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/types/git.types.ts`                              | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/types.ts`                                | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/constants.ts`                            | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/global.d.ts`                             | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/tsconfig.json`                           | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/graph/types.ts`                          | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/graph/constants.ts`                      | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/graph/branchColours.ts`                  | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/graph/palette.ts`                        | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/utils/format.ts`                         | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/webview/utils/ref.ts`                            | [shared-types.md](clean-room/shared-types.md)                           | `1d982f3`    |
| `src/old-extension/diffDocProvider.ts`                | [diff-docs.md](clean-room/diff-docs.md)                                 | `7645b5c`    |
| `src/old-extension/messageHandler.ts`                 | [legacy-host.md](clean-room/legacy-host.md)                             | `727d4a0`    |
| `src/old-extension/webviewBridge.ts`                  | [legacy-host.md](clean-room/legacy-host.md)                             | `727d4a0`    |
| `src/old-extension/repoManager.ts`                    | [legacy-host.md](clean-room/legacy-host.md)                             | `727d4a0`    |
| `src/old-extension/extensionState.ts`                 | [legacy-host.md](clean-room/legacy-host.md)                             | `727d4a0`    |
| `src/old-extension/l10n/webviewL10n.ts`               | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `l10n/bundle.l10n.json`                               | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `l10n/bundle.l10n.zh-cn.json`                         | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `l10n/bundle.l10n.zh-tw.json`                         | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `package.nls.json`                                    | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `package.nls.zh-cn.json`                              | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `package.nls.zh-tw.json`                              | [ui-wording.md](clean-room/ui-wording.md)                               | `e0f6c50`    |
| `scripts/check-l10n.js`                               | [ui-wording.md](clean-room/ui-wording.md)                               | `d67507c`    |
| `tests/backend/helpers.ts`                            | [tests-backend-queries.md](clean-room/tests-backend-queries.md)         | `c23aa1f`    |
| `tests/backend/queries/loadCommits/list.test.ts`      | [tests-backend-queries.md](clean-room/tests-backend-queries.md)         | `c23aa1f`    |
| `tests/backend/queries/loadBranches/list.test.ts`     | [tests-backend-queries.md](clean-room/tests-backend-queries.md)         | `c23aa1f`    |
| `tests/backend/queries/commitDetails/get.test.ts`     | [tests-backend-queries.md](clean-room/tests-backend-queries.md)         | `c23aa1f`    |
| `tests/backend/queries/signedCommits.test.ts`         | [tests-backend-queries.md](clean-room/tests-backend-queries.md)         | `c23aa1f`    |
| `tests/backend/actions/branch/rename.test.ts`         | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/branch/create.test.ts`         | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/branch/checkout.test.ts`       | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/branch/delete.test.ts`         | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/tag/add.test.ts`               | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/tag/push.test.ts`              | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/tag/delete.test.ts`            | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/commit/cherrypick.test.ts`     | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/commit/revert.test.ts`         | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/commit/reset.test.ts`          | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/commit/checkout.test.ts`       | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/merge/mergeCommit.test.ts`     | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/merge/mergeBranch.test.ts`     | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/actions/merge/conflicts.test.ts`       | [tests-backend-actions.md](clean-room/tests-backend-actions.md)         | `8120ada`    |
| `tests/backend/utils/repoSearch.test.ts`              | [tests-discovery-extension.md](clean-room/tests-discovery-extension.md) | `47f691c`    |
| `tests/backend/queries/repoSearch.test.ts`            | [tests-discovery-extension.md](clean-room/tests-discovery-extension.md) | `47f691c`    |
| `tests/extension/webviewBridge.test.ts`               | [tests-discovery-extension.md](clean-room/tests-discovery-extension.md) | `47f691c`    |
| `tests/extension/__mocks__/vscode.ts`                 | [tests-discovery-extension.md](clean-room/tests-discovery-extension.md) | `47f691c`    |
| `tests-ext/extension.test.ts`                         | [tests-discovery-extension.md](clean-room/tests-discovery-extension.md) | `47f691c`    |
| `tests/webview/lib/menus.test.ts`                     | [tests-webview-menus.md](clean-room/tests-webview-menus.md)             | `225dc7d`    |
| `tests/webview/lib/actions/clipboard.test.ts`         | [tests-webview-menus.md](clean-room/tests-webview-menus.md)             | `225dc7d`    |
| `tests/webview/components/commit/CommitRow.test.ts`   | [tests-webview-menus.md](clean-room/tests-webview-menus.md)             | `225dc7d`    |
| `tests/webview/setup.ts`                              | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/test-utils.ts`                         | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/utils/columns.test.ts`                 | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/lib/rpc-client.test.ts`                | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/utils/ref.test.ts`                     | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/utils/format.test.ts`                  | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |
| `tests/webview/lib/webview-config.test.ts`            | [tests-webview-utils.md](clean-room/tests-webview-utils.md)             | `864f33e`    |

Two inherited test files were not rewritten but removed, because other tests check the same behaviour: `tests-ext/repoManager.test.ts` and `tests/webview/components/commit/RefLabel.test.ts` ([tests-discovery-extension.md](clean-room/tests-discovery-extension.md) Q5, [tests-webview-menus.md](clean-room/tests-webview-menus.md) Q8).
