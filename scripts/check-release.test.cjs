const assert = require("node:assert/strict");
const { test } = require("node:test");

const { checkRelease } = require("./check-release.cjs");

const manifest = { publisher: "jcfurey", name: "neo-git-graph", version: "0.9.5" };

test("accepts local builds and the exact release tag", () => {
  assert.equal(checkRelease(manifest), "jcfurey.neo-git-graph@0.9.5");
  assert.equal(checkRelease(manifest, "v0.9.5"), "jcfurey.neo-git-graph@0.9.5");
});

test("rejects the upstream publisher and a renamed extension", () => {
  assert.throws(() => checkRelease({ ...manifest, publisher: "asispts" }), /identity/);
  assert.throws(() => checkRelease({ ...manifest, name: "another-graph" }), /identity/);
});

test("rejects missing, malformed, and prerelease versions", () => {
  for (const version of [undefined, "", "01.2.3", "1.2", "v1.2.3", "1.2.3-beta", "1.2.3+build"]) {
    assert.throws(() => checkRelease({ ...manifest, version }), /version/);
  }
});

test("rejects mismatched, unprefixed, or empty release tags", () => {
  for (const tag of ["v0.9.4", "0.9.5", "", "v0.9.5-extra"]) {
    assert.throws(() => checkRelease(manifest, tag), /must match/);
  }
});
