# Graph performance measurements

Run these from the repository root with dependencies installed:

```sh
pnpm benchmark
pnpm benchmark:ui
```

The backend benchmark creates a disposable repository with merges, remote-only history, and
submodules. It measures history/search, workspace scanning, loading 300/1,000/3,000 rows, hiding
one remote, focusing local/remote branches, graph layout, and cancellation. Each case runs three
sequential samples. The default fixture has 53,158 commits (including the submodule commit),
999 merges, 16 remote lanes, and 40 submodules.

The UI benchmark builds the production extension and runs an isolated VS Code workflow using
the same history topology without submodules. It measures 300, 1,000, and 3,000 loaded rows,
alternates the focused branch, hides/restores one remote, hovers commits, scrolls vertically,
pans horizontally, and loads five further 100-row pages. It asserts that each requested action
has reached its expected state. The normal UI suite excludes this slower diagnostic scenario.
Linux CI runs both benchmarks and uploads their reports and hover CPU profiles.

On Linux without a display, use `xvfb-run -a pnpm benchmark:ui`, or:

```sh
NGG_VSCODE_PATH=/usr/share/code/code NGG_HEADLESS=1 pnpm benchmark:ui
```

| Environment variable   | Default         | Applies to                                                   |
| ---------------------- | --------------- | ------------------------------------------------------------ |
| `NGG_BENCH_COMMITS`    | 50000           | Base history size; both benchmarks add merge/remote fixtures |
| `NGG_BENCH_SUBMODULES` | 40              | Backend submodule count                                      |
| `NGG_BENCH_ROWS`       | `300,1000,3000` | UI loaded-row counts, 300–10000                              |
| `NGG_BENCH_SAMPLES`    | 5               | UI samples per action, 3–20                                  |

Choose a base history larger than the largest row count plus `100 × samples`. The JSON reports
contain actual fixture sizes, all samples, medians, and nearest-rank p95 values. With three or
five samples p95 is simply the slowest sample, not a population estimate.

Reports go to `test-results/benchmark.json` and `test-results/benchmark-ui.json`. Load
`test-results/benchmark-hover-*.cpuprofile` in Chromium/VS Code developer tools to inspect CPU
work during hover. Runs replace these artifacts; copy them before comparing another change.

## What the timings mean

UI action timing starts inside Chromium immediately before the action. It ends after the expected
DOM state and two animation frames, so it includes Git/bridge latency, rendering, and a roughly
33–50 ms frame floor on this machine. Transport polling is outside the measured interval. Hover
samples also run with the CPU profiler enabled. Long tasks over 50 ms are collected separately.
The load-more samples begin at the configured row count and grow by 100 each time; all other
actions run at the configured count.

Vertical scrolling reports animation-frame intervals during 60 programmatic top/bottom scrolls.
Horizontal panning reports action-to-settled time, not a frame rate. These headless, GPU-disabled
measurements are not physical input-to-display latency or a substitute for testing real hardware.

Run comparisons sequentially on the same machine, VS Code version, build mode, and viewport.
Warm filesystem caches, JIT, garbage collection, hardware, and background activity affect results.
CI fails on incorrect behavior, not timing thresholds. Avoid treating small timing changes as
improvements without further samples.

## Findings from 2026-09-18

The recorded comparison uses Linux x64, a Ryzen Threadripper 3970X, VS Code 1.138.0 / Chromium 148,
a 1392 × 908 webview, and the 53,157-commit UI fixture. The baseline production code is `2e997e1`;
the comparison includes the graph-rendering changes described below. Raw results and the measured
medians are recorded in [the comparison data](benchmarks/2026-09-18.json).

Medians in milliseconds (baseline → this change):

| Loaded rows | Focus change  | Hide remote   | Hover        | Load more      |
| ----------- | ------------- | ------------- | ------------ | -------------- |
| 300         | 415.1 → 403   | 679 → 702.3   | 41.8 → 45.1  | 685.2 → 650    |
| 1000        | 484.2 → 469.4 | 854 → 788.4   | 43.1 → 43.8  | 759.5 → 765.4  |
| 3000        | 877.4 → 682.1 | 1388.2 → 1145 | 170.1 → 40.7 | 1259.2 → 972.4 |

At 3,000 rows the hover samples no longer contain tasks over 50 ms. Vertical scroll intervals
remain about 16.7 ms median / 33.3 ms p95, so this is not a claim of uniformly smooth scrolling.

The CPU profile identified a full commit-list scan repeated for every row when choosing the
keyboard tab stop. The table now chooses that row once per render. Hover also previously rendered
all text rows; it now updates the graph alone and reuses line geometry that has not changed.
Keyboard, hover, selection, focus, expanded details, and graph geometry remain regression-tested.

A trial replacing the two concurrent ancestry walks with a single parent-list walk did not improve
the backend measurement (about 340–350 ms versus 300–310 ms), so the existing implementation is
retained. No ancestry cache was added: branch tips alone would not invalidate cached ancestry after
shallow fetches or replacement-ref changes. Tests cover moved refs, skewed dates, and deepening a
shallow repository.

The graph still renders every loaded row. This batch removes measured repeated work without
changing scrolling, selection, or expanded-details behavior through virtualization. Large page
updates and occasional long frames remain at 3,000 rows; the reports provide a baseline for
evaluating virtualization or a correctly invalidated ancestry cache separately.
