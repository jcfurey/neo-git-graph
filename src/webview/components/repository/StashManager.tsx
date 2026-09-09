import type { StashDetails } from "@/backend/types";
import { Button } from "@/webview/components/ui/Button";
import { openContentDialog, openFormDialog } from "@/webview/lib/actions";
import {
  confirmRepositoryAction,
  requestRepositoryQuery,
  sendRepositoryAction
} from "@/webview/lib/repository-actions";
import { selectedRepo } from "@/webview/lib/stores";
import { format } from "@/webview/utils/format";

export function StashManager({ stashes, repo }: { stashes: StashDetails[]; repo: string }) {
  return (
    <div class="space-y-3 text-left">
      <Button
        onClick={() =>
          openFormDialog({
            message: window.l10n.saveStash,
            inputs: [
              { kind: "text", label: window.l10n.dialogAddTagMessage, value: "" },
              { kind: "checkbox", label: window.l10n.includeUntracked, value: false }
            ],
            action: window.l10n.saveStash,
            source: null,
            onSubmit: ([message, includeUntracked]) =>
              sendRepositoryAction({ kind: "saveStash", message, includeUntracked }, repo)
          })
        }
      >
        {window.l10n.saveStash}
      </Button>
      {stashes.length === 0 && <p>{window.l10n.noStashes}</p>}
      {stashes.map((stash) => (
        <div key={stash.ref} class="space-y-2 rounded border border-line p-2">
          <p class="break-words">
            <b>{stash.ref}</b> {stash.message}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                sendRepositoryAction(
                  { kind: "stash", operation: "inspect", stash, reinstateIndex: false },
                  repo
                )
              }
            >
              {window.l10n.inspectStash}
            </Button>
            {(["apply", "pop"] as const).map((operation) => {
              const label = operation === "pop" ? window.l10n.popStash : window.l10n.applyStash;
              return (
                <Button
                  key={operation}
                  onClick={() =>
                    openFormDialog({
                      message: (
                        <>
                          {label}: <b>{stash.message}</b>
                        </>
                      ),
                      inputs: [
                        { kind: "checkbox", label: window.l10n.reinstateIndex, value: false }
                      ],
                      action: label,
                      source: null,
                      onSubmit: ([reinstateIndex]) =>
                        sendRepositoryAction(
                          { kind: "stash", operation, stash, reinstateIndex },
                          repo
                        )
                    })
                  }
                >
                  {label}
                </Button>
              );
            })}
            <Button
              onClick={() =>
                confirmRepositoryAction(
                  format(window.l10n.dropStashConfirm, <b>{stash.message}</b>),
                  window.l10n.dropStash,
                  { kind: "stash", operation: "drop", stash, reinstateIndex: false },
                  repo
                )
              }
            >
              {window.l10n.dropStash}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function openStashes() {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  requestRepositoryQuery(
    { kind: "stashes" },
    (data) => {
      if (data.kind === "stashes") {
        openContentDialog(window.l10n.stashes, <StashManager stashes={data.stashes} repo={repo} />);
      }
    },
    repo
  );
}
