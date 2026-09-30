# Clean-room specification: README and issue templates

This document describes the parts of `README.md` and of the two GitHub issue templates that
Branchwise still carries from the upstream projects, so that they can be written again in new
words. It is written for someone who will never see the current wording: before they start, each
inherited README line is replaced by a placeholder comment, and the issue templates are deleted.

It never quotes an inherited line. Text that Branchwise wrote itself is quoted freely. Setting
names, defaults and allowed values come from `package.json`, which Branchwise owns, and are
quoted too.

## 0. How this was derived

- Repository at commit `5a892da`, where `node scripts/provenance.cjs` reported 127 inherited lines
  before the changelog change and 72 after it.
- `node scripts/provenance.cjs --lines <file>` listed the inherited lines in scope:

  | File                                        | Inherited lines | What they are                                                                                                                                               |
  | ------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `README.md`                                 | 28              | header markup and navigation, five section headings, five feature bullets, the settings table's header and six of its rows, one sentence under Contributing |
  | `.github/ISSUE_TEMPLATE/bug_report.md`      | 16              | the whole template                                                                                                                                          |
  | `.github/ISSUE_TEMPLATE/feature_request.md` | 9               | the whole template                                                                                                                                          |
  | `CHANGELOG.md`                              | 2               | the title and the Unreleased heading; see Decisions, D6                                                                                                     |
  | `LICENSE`                                   | 17              | the MIT notices; see Decisions, D7                                                                                                                          |

## 1. Scope and rules

The writer:

- replaces every `<!-- REWRITE … -->` placeholder in `README.md` with new text, as described in
  part 2, and removes the placeholders;
- may edit the Branchwise-owned lines around a placeholder when the new text needs it (for example,
  to keep the feature list consistent), but keeps what they say;
- does not change the **Origins and license** section, which is being rewritten separately;
- writes new issue templates as described in part 3;
- runs `pnpm run format` and `pnpm run check:links` before committing.

The writer does not open the old README or templates, their history (`git log -p`, `git show`,
`git blame` on those paths), or any copy of them, such as a packaged VSIX, the `.vscode-test`
folder, or an upstream checkout.

## 2. README.md

### Header (placeholder `REWRITE header`)

The top of the README, before the first section. It must:

- centre Branchwise's icon, `resources/icon.png`, shown at a height of about 128 pixels;
- show the title `Branchwise for Visual Studio Code` and, below it, the tagline
  `Visual Git history, branch focus, repository workflows, and devcontainer support.` (both
  Branchwise's own);
- link to every `##` section of the README, in order, on one centred line;
- show the licence badge, a link to `./LICENSE` wrapping
  `https://img.shields.io/github/license/jcfurey/neo-git-graph` with the alt text `License`
  (Branchwise's own);
- leave some space before the first section.

GitHub renders the README from HTML and Markdown; VS Code's extension page renders it as well, so
the header must look right in both. Plain HTML elements that both support, such as `div`, `p`,
`img` and `a` with `align`, are fine.

### Section headings (placeholders `REWRITE heading S1` … `S5`)

Five `##` headings, one before each of these sections. The anchors they produce must match the
header's links. Nothing else in the repository links to them.

| Placeholder | Section content (Branchwise's own)                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| S1          | the list of what Branchwise does, followed by links to the action and preference guides                                |
| S2          | how to build Branchwise from a checkout and install the VSIX, the rename from `jcfurey.neo-git-graph`, the walkthrough |
| S3          | what has shipped, the completed backlog in `todo.md`, and what remains deferred                                        |
| S4          | the table of settings                                                                                                  |
| S5          | where to report bugs, ask for features and discuss                                                                     |

### Feature bullets (placeholders `REWRITE feature F1` … `F5`)

Each is one bullet in the feature list, in the list's own style (part 4): a short bold label, a
colon, and a phrase.

| Placeholder | What the bullet must tell the reader                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| F1          | selecting a commit opens a panel with its full message, the files it changed, and a diff for each file                        |
| F2          | branches can be created, checked out, renamed, deleted and merged from the graph                                              |
| F3          | tags can be created, deleted and pushed to a remote                                                                           |
| F4          | a commit can be checked out, cherry-picked, reverted, or have the current branch reset to it                                  |
| F5          | Branchwise works when VS Code is connected to a remote machine or a container (Remote - SSH, WSL, Dev Containers, Codespaces) |

The writer may merge F2–F4 into fewer bullets, or reword the label of a neighbouring Branchwise
bullet so that the list reads well, as long as every action above stays listed.

### Settings table (placeholders `REWRITE table header` and `REWRITE setting …`)

The table under S4 has three columns: the setting's name without the `branchwise.` prefix, its
default, and a short description. The header row names those three columns. Six rows are
placeholders; the other six rows are Branchwise's and show the style.

Each description says what the setting controls. For a setting with a fixed set of values, it
names them, in backticks and quotes as in the default column. Descriptions stay short: the
longest of Branchwise's is 47 characters.

| Placeholder                                  | Default         | Allowed values                               | What it controls                                                                    |
| -------------------------------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `REWRITE setting dateFormat`                 | `"Date & Time"` | `"Date & Time"`, `"Date Only"`, `"Relative"` | how dates in the date column are written                                            |
| `REWRITE setting dateType`                   | `"Author Date"` | `"Author Date"`, `"Commit Date"`             | which of a commit's two dates is shown                                              |
| `REWRITE setting graphStyle`                 | `"rounded"`     | `"rounded"`, `"angular"`                     | whether lines that change lanes are drawn as curves or as angled segments           |
| `REWRITE setting initialLoadCommits`         | `300`           | any positive number                          | how many commits are loaded when the graph first shows a repository or branch       |
| `REWRITE setting showCurrentBranchByDefault` | `false`         | `true`, `false`                              | whether the graph opens showing only the checked-out branch instead of all branches |
| `REWRITE setting tabIconColourTheme`         | `"colour"`      | `"colour"`, `"grey"`                         | whether the graph tab's icon is in colour or grey                                   |

Rows stay in alphabetical order of the setting name, as they are now.

### Contributing pointer (placeholder `REWRITE contributing pointer`)

One sentence after the Issues link, sending readers to the S3 section for where the project is
heading. It must link to that section's anchor.

## 3. Issue templates

Two templates in `.github/ISSUE_TEMPLATE/`, offered when someone opens a new issue on GitHub.
Their format is the writer's choice within Decisions, D2.

**Bug report.** Titled so that a reporter recognises it as the way to report something broken.
It applies the repository's `bug` label. It gathers:

- what went wrong;
- the steps that make it happen, as a numbered list;
- the result the reporter wanted;
- the result they got, including any error message;
- optionally, screenshots, or the lines from Branchwise's log (the **Branchwise** channel in the
  Output panel) around the failure;
- the environment: the VS Code version, the Branchwise version, the Git version, the operating
  system, and whether VS Code was connected to a remote machine or container.

**Feature request.** Titled so that a reporter recognises it as the way to ask for something new.
It applies the repository's `enhancement` label. It gathers:

- the feature being asked for;
- what the reporter cannot do today, or what gets in their way;
- the reporter's idea of how it should behave;
- optionally, alternatives they have considered or workarounds they use now.

Every prompt is written for the reporter, in the second person, in the style of part 4.

## 4. Style, from Branchwise's own text

- Feature bullets: `- **Label**: phrase`. Labels are sentence case and two or three words
  (`**Branch focus**`, `**Reflog recovery**`, `**Remote branch checkout**`). Phrases start with a
  capital, use the imperative or a plain verb (`Inspect branches, local changes, …`,
  `Find older branch/HEAD positions, …`) and end without a full stop.
- UI names are bold and match the UI (`**View → Focus direct history**`, `**Reveal selected
lane**`).
- Headings are sentence case (`## Origins and license`).
- Prose is plain and specific, American spelling except in setting names, which keep their British
  spelling (`graphColours`, `tabIconColourTheme`).
- Code, setting names, values and file names are in backticks.

## 5. Decisions

- **D1. Scope of the README rewrite.** Only the placeholders are rewritten, plus what the
  surrounding lines need to read well. The README's Branchwise-owned sections stay as they are.
- **D2. Issue forms.** Write the templates as GitHub issue forms (`bug_report.yml` and
  `feature_request.yml`) rather than Markdown. Forms can require the reproduction steps and the
  versions, which reports most often omit, and offer a drop-down for the remote environment.
  Leave blank issues enabled, so no `config.yml` is needed.
- **D3. Git version in bug reports.** Added: Branchwise runs the user's Git, and its behaviour
  depends on the version.
- **D4. Labels.** `bug` and `enhancement` are GitHub's default labels, which the repository has;
  they are dictated.
- **D5. Anchors.** The header links must match the new headings. Only `#origins-and-license` is
  linked from elsewhere (`docs/packaging.md`), and that heading is not a placeholder.
- **D6. Changelog.** Releases 0.6.0 and earlier are asispts/neo-git-graph's, so their notes were
  removed and replaced by a link to that project's changelog at `v0.6.0` (commit `5a892da`). The
  two remaining inherited lines are the title and the Unreleased heading that the
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format prescribes; they are dictated and
  recorded as reviewed.
- **D7. Licence.** With nothing inherited left, Branchwise is released under the Apache License
  2.0. `LICENSE` holds the licence's standard text, unchanged, in place of the two MIT notices;
  `package.json`, the README's Origins and license section, and the documents that mention the
  licence are updated in the same change. Earlier versions, which contained inherited code,
  remain available under the MIT License.
