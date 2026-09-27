const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { compare, inheritedLines, substantiveLines } = require("./provenance.cjs");

test("counts statements, comments and prose, not punctuation or module wiring", () => {
  const lines = [
    'import { a, b } from "./x";',
    "import {",
    "  first,",
    "  second",
    '} from "./y";',
    'export * from "./z";',
    "",
    "}",
    "  });",
    "} else {",
    "return;",
    "</div>",
    "// Why the cache is keyed by locale.",
    "const cache = new Map<string, number>();",
    "The graph shows every branch."
  ];
  assert.deepEqual(substantiveLines(lines), [...Array(12).fill(false), true, true, true]);
});

test("reports files that gained inherited lines, and those that lost them", () => {
  assert.deepEqual(
    compare({ "a.ts": 5, "b.ts": 2, "gone.ts": 1 }, { "a.ts": 6, "b.ts": 1, "new.ts": 3 }),
    {
      increased: [
        ["a.ts", 5, 6],
        ["new.ts", 0, 3]
      ],
      decreased: [
        ["b.ts", 2, 1],
        ["gone.ts", 1, 0]
      ]
    }
  );
});

test("attributes lines to upstream commits, following lines moved to another file", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "branchwise-provenance-"));
  try {
    const git = (...args) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=T",
          "-c",
          "user.email=t@example.com",
          "-c",
          "commit.gpgsign=false",
          ...args
        ],
        { cwd: repo, encoding: "utf8" }
      ).trim();
    git("init", "-q", "-b", "main");
    const upstream = [
      "const first = compute(1);",
      "const second = compute(2);",
      "const third = compute(3);",
      "const fourth = compute(4);",
      "const fifth = compute(5);"
    ];
    fs.writeFileSync(path.join(repo, "old.ts"), upstream.join("\n") + "\n");
    git("add", ".");
    git("commit", "-q", "-m", "upstream");
    const forkPoint = git("rev-parse", "HEAD");

    // Rewrite one line, and move the last three lines to a new file.
    fs.writeFileSync(
      path.join(repo, "old.ts"),
      ["const first = rewritten(1);", upstream[1]].join("\n") + "\n"
    );
    fs.writeFileSync(path.join(repo, "moved.ts"), upstream.slice(2).join("\n") + "\n");
    git("add", ".");
    git("commit", "-q", "-m", "ours");

    assert.deepEqual(await inheritedLines({ cwd: repo, forkPoint }), {
      "moved.ts": 3,
      "old.ts": 1
    });
    // Uncommitted work counts as ours too.
    fs.writeFileSync(path.join(repo, "moved.ts"), "const replaced = true;\n");
    assert.deepEqual(await inheritedLines({ cwd: repo, forkPoint }), { "old.ts": 1 });
    assert.equal(await inheritedLines({ cwd: repo, forkPoint: "0".repeat(40) }), null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
