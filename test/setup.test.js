import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sandbox } from "./support/cli.js";

const EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"];

function settingsFile(s) {
  return join(s.env.CLAUDE_CONFIG_DIR, "settings.json");
}

function readSettings(s) {
  return JSON.parse(readFileSync(settingsFile(s), "utf8"));
}

function seed(s, settings) {
  mkdirSync(s.env.CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(settingsFile(s), JSON.stringify(settings));
}

const OTHER = { matcher: "Bash", hooks: [{ type: "command", command: "other-tool check" }] };

test("setup adds async hooks for every event and keeps other settings", async () => {
  const s = sandbox();
  seed(s, { model: "opus", hooks: { PostToolUse: [OTHER] } });
  const { output, exitCode } = await s.cli("setup", "claude");
  assert.equal(exitCode, 0);
  assert.match(output, /setup: installed/);
  const settings = readSettings(s);
  assert.equal(settings.model, "opus");
  for (const event of EVENTS) {
    const ours = settings.hooks[event]
      .flatMap((g) => g.hooks)
      .filter((h) => h.command === "hours-axi hook");
    assert.equal(ours.length, 1, event);
    assert.equal(ours[0].async, true);
  }
  assert.deepEqual(settings.hooks.PostToolUse[0], OTHER);
});

test("running setup twice changes nothing", async () => {
  const s = sandbox();
  await s.cli("setup", "claude");
  const first = readFileSync(settingsFile(s), "utf8");
  assert.match((await s.cli("setup", "claude")).output, /already installed/);
  assert.equal(readFileSync(settingsFile(s), "utf8"), first);
});

test("--remove takes out only our hooks", async () => {
  const s = sandbox();
  seed(s, { hooks: { PostToolUse: [OTHER] } });
  await s.cli("setup", "claude");
  assert.match((await s.cli("setup", "claude", "--remove")).output, /setup: removed/);
  assert.deepEqual(readSettings(s), { hooks: { PostToolUse: [OTHER] } });
  assert.match((await s.cli("setup", "claude", "--remove")).output, /not installed/);
});

test("an unparseable settings file is left untouched", async () => {
  const s = sandbox();
  mkdirSync(s.env.CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(settingsFile(s), "{ not json");
  const { exitCode, output } = await s.cli("setup", "claude");
  assert.equal(exitCode, 1);
  assert.match(output, /left unchanged/);
  assert.equal(readFileSync(settingsFile(s), "utf8"), "{ not json");
});
