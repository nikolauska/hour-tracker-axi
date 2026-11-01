import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readEvents } from "../dist/events.js";
import { recordHook } from "../dist/hook.js";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "hours-hook-"));
  mkdirSync(join(root, "alpha", ".git"), { recursive: true });
  return { root, env: { HOURS_AXI_DATA_DIR: join(root, "data") } };
}

test("a hook payload is stored as metadata only", () => {
  const { root, env } = sandbox();
  const payload = {
    session_id: "s1",
    cwd: join(root, "alpha"),
    hook_event_name: "UserPromptSubmit",
    prompt: "secret prompt text",
    transcript_path: "/x/transcript.jsonl",
  };
  assert.equal(recordHook(JSON.stringify(payload), env, Date.parse("2026-11-02T09:00:00Z")), true);
  const [event] = readEvents(join(env.HOURS_AXI_DATA_DIR, "events.jsonl"));
  assert.deepEqual(event, {
    v: 1,
    type: "activity",
    ts: "2026-11-02T09:00:00.000Z",
    session: "s1",
    event: "UserPromptSubmit",
    cwd: join(root, "alpha"),
    project: "alpha",
  });
});

test("garbage input records nothing", () => {
  const { env } = sandbox();
  assert.equal(recordHook("not json", env), false);
  assert.equal(recordHook("{}", env), false);
  assert.deepEqual(readEvents(join(env.HOURS_AXI_DATA_DIR, "events.jsonl")), []);
});

test("the hook binary prints nothing and exits 0 even on bad input", () => {
  const { env } = sandbox();
  const result = spawnSync(process.execPath, ["dist/bin/hours-axi.js", "hook"], {
    input: "garbage",
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
