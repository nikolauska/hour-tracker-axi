import assert from "node:assert/strict";
import test from "node:test";
import { sandbox } from "./support/cli.js";

test("with no data the home view says so and points to setup", async () => {
  const s = sandbox();
  const { output, exitCode } = await s.cli();
  assert.equal(exitCode, 0);
  assert.match(output, /no events recorded yet/);
  assert.match(output, /hours-axi setup claude/);
});

test("the home view shows today's blocks, the running one, and unlabeled ones", async () => {
  const s = sandbox("2026-11-02T12:00:00.000Z");
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  s.ping("b", "2026-11-02T11:40:00.000Z");
  s.ping("b", "2026-11-02T11:55:00.000Z");
  const { output } = await s.cli();
  assert.match(output, /today: 2026-11-02/);
  assert.match(output, /total: 25m/);
  assert.match(output, /active:\n\s+id: b-[0-9a-f]{6}\n\s+project: alpha\n\s+since: "11:40"/);
  assert.match(output, /blocks\[2\]/);
  assert.match(output, /--block <id>/);
});

test("the home view lists corrections whose block no longer exists", async () => {
  const s = sandbox("2026-11-02T12:00:00.000Z");
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  s.append({ v: 1, type: "edit", ts: "2026-11-02T11:00:00.000Z", block: "b-000000", note: "x" });
  const { output } = await s.cli();
  assert.match(
    output,
    /orphaned\[1\]\{type,block,recorded\}:\n\s+edit,b-000000,"2026-11-02 11:00"/,
  );
  assert.match(output, /redo them/);
});
