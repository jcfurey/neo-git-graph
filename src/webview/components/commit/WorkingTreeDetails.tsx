import type { WorkingTreeGroup } from "@/backend/types";
import { DetailsRow } from "@/webview/components/commit/CommitDetails";
import { QueryStatus } from "@/webview/components/history/QueryControls";
import { Button } from "@/webview/components/ui/Button";
import { refresh } from "@/webview/lib/actions";
import { sendRepositoryAction } from "@/webview/lib/repository-actions";
import { useRepositoryQuery } from "@/webview/lib/use-repository-query";

export function WorkingTreeDetails() {
  const query = useRepositoryQuery({ kind: "workingTree" });
  const groups: [WorkingTreeGroup, string][] = [
    ["conflicts", window.l10n.conflicts],
    ["unstaged", window.l10n.unstagedChanges],
    ["staged", window.l10n.stagedChanges],
    ["untracked", window.l10n.untrackedFiles]
  ];
  return (
    <DetailsRow>
      <div class="mr-8 flex h-full flex-col px-3 py-2" data-working-tree-details>
        <div class="flex shrink-0 items-center justify-between gap-3 pb-2">
          <span class="text-muted">{window.l10n.workingTreeHint}</span>
          <Button onClick={refresh}>{window.l10n.refresh}</Button>
        </div>
        <div class="min-h-0 overflow-auto" aria-busy={query.loading}>
          <QueryStatus loading={query.loading} error={query.error} />
          {!query.loading &&
            !query.error &&
            query.data &&
            (query.data.files.length === 0 ? (
              <p class="p-3 text-muted">{window.l10n.noWorkingTreeChanges}</p>
            ) : (
              groups.map(([group, label]) => {
                const files = query.data!.files.filter((file) => file.group === group);
                if (files.length === 0) {
                  return null;
                }
                return (
                  <section key={group} class="pb-3" aria-label={label}>
                    <h3 class="pb-1 font-semibold">
                      {label} ({files.length})
                    </h3>
                    <ul class="list-none">
                      {files.map((file) => (
                        <li key={file.path}>
                          <button
                            type="button"
                            class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left hover:bg-row-hover focus:outline-1 focus:outline-focus"
                            title={
                              file.oldPath !== file.path
                                ? `${file.oldPath} → ${file.path}`
                                : file.path
                            }
                            onClick={() =>
                              sendRepositoryAction({
                                kind: "viewWorkingTreeFile",
                                path: file.path,
                                group
                              })
                            }
                          >
                            <span class="w-6 shrink-0 font-mono text-muted">{file.status}</span>
                            <span class="truncate">{file.path}</span>
                            {file.oldPath !== file.path && (
                              <span class="truncate text-muted">← {file.oldPath}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            ))}
        </div>
      </div>
    </DetailsRow>
  );
}
