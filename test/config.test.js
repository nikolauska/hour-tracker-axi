import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadSettings } from "../dist/config.js";

function withConfig(raw) {
  const dir = mkdtempSync(join(tmpdir(), "hours-config-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), raw);
  return { HOURS_AXI_CONFIG_DIR: dir };
}

test("a valid config overrides the defaults", () => {
  const settings = loadSettings(withConfig('{"roundMinutes": 30, "projects": {"alpha": "A"}}'));
  assert.deepEqual(settings, {
    idleGapMinutes: 15,
    roundMinutes: 30,
    branchRefs: true,
    projects: { alpha: "A" },
  });
});

for (const [label, raw] of [
  ["null", "null"],
  ["an array", "[]"],
  ["non-object projects", '{"projects": "alpha"}'],
  ["non-string project names", '{"projects": {"alpha": 1}}'],
  ["non-boolean branchRefs", '{"branchRefs": "yes"}'],
]) {
  test(`${label} is a config error, not a crash`, () => {
    assert.throws(() => loadSettings(withConfig(raw)), { code: "CONFIG_ERROR" });
  });
}

test("a ~/ project key is expanded against HOME", () => {
  const env = { ...withConfig('{"projects": {"~/work/api": "API"}}'), HOME: "/home/me" };
  assert.deepEqual(loadSettings(env).projects, { "/home/me/work/api": "API" });
});
