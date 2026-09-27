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

## End state

When `pnpm run provenance` reports no inherited lines and the logged rewrites cover the modules
that had them, Branchwise moves to a new repository that starts from a fresh first commit, so its
history contains no upstream code either. This repository is then archived as the record of where
the code came from and how it was replaced.

## Rewritten modules

| Module                                             | Specification                                   | Rewritten in |
| -------------------------------------------------- | ----------------------------------------------- | ------------ |
| `src/webview/utils/date.ts`                        | [date.md](clean-room/date.md)                   | `bc67508`    |
| `src/extension/rpc/rpc-server.ts`                  | [rpc-server.md](clean-room/rpc-server.md)       | `ce0d7bb`    |
| `src/webview/lib/rpc/rpc-handler.ts`               | [rpc-handler.md](clean-room/rpc-handler.md)     | `8983b4e`    |
| `src/webview/graph/utils.ts`                       | [graph-utils.md](clean-room/graph-utils.md)     | `b71ac82`    |
| `src/webview/components/commit/useColumnResize.ts` | [column-resize.md](clean-room/column-resize.md) | `391b9fd`    |
