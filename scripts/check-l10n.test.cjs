const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  checkTranslations,
  englishProblems,
  placeholders,
  translationProblems
} = require("./check-l10n.js");

const ENGLISH = { "A {0}": "A {0}", B: "B", "C {0} {1}": "C {0} {1}", D: "D" };
const GOOD = { "A {0}": "a {0}", B: "b", "C {0} {1}": "c {1} {0}", D: "d" };

/** A repository root holding `files` (path to JSON value), removed after the test. */
function repository(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "branchwise-l10n-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const all = { "l10n/bundle.l10n.json": ENGLISH, "package.nls.json": {}, ...files };
  for (const [file, value] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    const text = typeof value === "string" ? value : JSON.stringify(value);
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** Run the check on `root`, collecting what it writes to each stream. */
function check(root) {
  const out = [];
  const err = [];
  const code = checkTranslations(
    root,
    (line) => out.push(line),
    (line) => err.push(line)
  );
  return { code, out, err };
}

test("placeholders are numbers in braces, each listed once in order of appearance", () => {
  assert.deepEqual(placeholders("{1} and {0}, {1} again, {12}"), ["{1}", "{0}", "{12}"]);
  assert.deepEqual(placeholders("{} {x} {-1} { 0 } {٣}"), []);
});

test("a complete translation passes, whatever the order or repetition of its placeholders", () => {
  assert.deepEqual(translationProblems(ENGLISH, GOOD), []);
  const repeated = { "A {0}": "a {0} {0}", B: "b", "C {0} {1}": "c {0}{1}", D: "d" };
  assert.deepEqual(translationProblems(ENGLISH, repeated), []);
});

test("problems are listed stale first, then missing, then placeholders", () => {
  const translated = { "A {0}": "a", B: "b", "C {0} {1}": "c {0} {1} {2}", E: "e", "B ": "x" };
  assert.deepEqual(translationProblems(ENGLISH, translated), [
    'stale (not in English): "E"',
    'stale (not in English): "B "',
    'missing translation: "D"',
    'placeholder {0} dropped: "A {0}"',
    'placeholder {2} added: "C {0} {1}"'
  ]);
});

test("dropped placeholders come before added ones, each in order of first appearance", () => {
  assert.deepEqual(
    translationProblems({ "{10} {11}": "{10} {11}" }, { "{10} {11}": "{1}{0}{1}{11}" }),
    [
      'placeholder {10} dropped: "{10} {11}"',
      'placeholder {1} added: "{10} {11}"',
      'placeholder {0} added: "{10} {11}"'
    ]
  );
});

test("names that every object inherits are compared as own keys", () => {
  assert.deepEqual(translationProblems(ENGLISH, { ...GOOD, toString: "t", constructor: "c" }), [
    'stale (not in English): "toString"',
    'stale (not in English): "constructor"'
  ]);
  assert.deepEqual(translationProblems({ toString: "T" }, {}), ['missing translation: "toString"']);
});

test("an empty translation is missing, and its placeholders are not reported again", () => {
  assert.deepEqual(translationProblems(ENGLISH, { ...GOOD, "A {0}": "", D: "" }), [
    'missing translation: "A {0}"',
    'missing translation: "D"'
  ]);
});

test("values that are not strings are reported instead of stopping the check", () => {
  const translated = { ...GOOD, "A {0}": { message: "a {0}", comment: ["c"] }, B: 2, D: null };
  assert.deepEqual(translationProblems(ENGLISH, translated), [
    'not a string: "A {0}"',
    'not a string: "B"',
    'not a string: "D"'
  ]);
  const english = { ...ENGLISH, B: { message: "B", comment: ["c"] } };
  assert.deepEqual(englishProblems(english), ['not a string: "B"']);
  assert.deepEqual(translationProblems(english, GOOD), []);
});

test("every translation file is checked, in sorted order, with one line each when it passes", (t) => {
  const root = repository(t, {
    "l10n/bundle.l10n.zz.json": GOOD,
    "l10n/bundle.l10n.aa.json": GOOD,
    "l10n/bundle.l10n.a.b.json": GOOD,
    "l10n/bundle.l10n.xx.json.bak": "not JSON",
    "l10n/bundle.l10n..json": "not JSON",
    "package.nls.json": { "config.x": "X {0}" },
    "package.nls.zh-tw.json": { "config.x": "x {0}" },
    "package.nls.zh-cn.json": { "config.x": "x {0}" }
  });
  assert.deepEqual(check(root), {
    code: 0,
    out: [
      "✓ bundle.l10n.a.b.json (4/4 translated)",
      "✓ bundle.l10n.aa.json (4/4 translated)",
      "✓ bundle.l10n.zz.json (4/4 translated)",
      "✓ package.nls.zh-cn.json (1/1 translated)",
      "✓ package.nls.zh-tw.json (1/1 translated)"
    ],
    err: []
  });
});

test("a failing file lists its problems, the others are still checked, and the check fails", (t) => {
  const root = repository(t, {
    "l10n/bundle.l10n.xx.json": { ...GOOD, D: "" },
    "l10n/bundle.l10n.yy.json": GOOD,
    "package.nls.json": { "config.x": "X {0}", "config.y": "Y" },
    "package.nls.zh-cn.json": { "config.x": "x", "config.z": "z" }
  });
  assert.deepEqual(check(root), {
    code: 1,
    out: ["✓ bundle.l10n.yy.json (4/4 translated)"],
    err: [
      "✗ bundle.l10n.xx.json",
      '  missing translation: "D"',
      "✗ package.nls.zh-cn.json",
      '  stale (not in English): "config.z"',
      '  missing translation: "config.y"',
      '  placeholder {0} dropped: "config.x"',
      "",
      "l10n check failed."
    ]
  });
});

test("an English value that is not a string fails the English file", (t) => {
  const root = repository(t, {
    "l10n/bundle.l10n.json": { ...ENGLISH, B: { message: "B", comment: ["c"] } },
    "l10n/bundle.l10n.xx.json": GOOD
  });
  assert.deepEqual(check(root), {
    code: 1,
    out: ["✓ bundle.l10n.xx.json (4/4 translated)"],
    err: ["✗ bundle.l10n.json", '  not a string: "B"', "", "l10n check failed."]
  });
});

test("with no translation files nothing is printed and the check passes", (t) => {
  assert.deepEqual(check(repository(t, {})), { code: 0, out: [], err: [] });
});

test("run as a script, it checks the repository above its own folder", (t) => {
  const root = repository(t, {
    "l10n/bundle.l10n.xx.json": GOOD,
    "l10n/bundle.l10n.yy.json": { ...GOOD, E: "e" }
  });
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(path.join(__dirname, "check-l10n.js"), path.join(root, "scripts/check-l10n.js"));
  const result = spawnSync(process.execPath, [path.join(root, "scripts/check-l10n.js")], {
    cwd: os.tmpdir(),
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "✓ bundle.l10n.xx.json (4/4 translated)\n");
  assert.equal(
    result.stderr,
    '✗ bundle.l10n.yy.json\n  stale (not in English): "E"\n\nl10n check failed.\n'
  );
});
