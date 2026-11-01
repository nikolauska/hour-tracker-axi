import assert from "node:assert/strict";
import test from "node:test";
import { sandbox } from "./support/cli.js";

test("blocks lists a chosen day with ids and credited time", async () => {
  const s = sandbox("2026-11-03T12:00:00.000Z");
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  const { output } = await s.cli("blocks", "--day", "yesterday");
  assert.match(output, /day: 2026-11-02/);
  assert.match(output, /blocks\[1\]\{id,project,start,end,time,note,ref,manual\}:/);
  assert.match(output, /b-[0-9a-f]{6},alpha,"09:00","09:10",10m,\(none\),\(none\),false/);
});

test("an empty day is stated explicitly", async () => {
  const s = sandbox();
  const { output } = await s.cli("blocks");
  assert.match(output, /0 blocks on 2026-11-02/);
});

test("a malformed day is a usage error", async () => {
  const s = sandbox();
  const { output, exitCode } = await s.cli("blocks", "--day", "2026-13-40");
  assert.equal(exitCode, 2);
  assert.match(output, /--day must be/);
});
