import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEvents } from "../dist/events.js";
import { sandbox } from "./support/cli.js";

test("a note joins the running block of the current repo", async () => {
  const s = sandbox("2026-11-02T09:12:00.000Z");
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  const { output, exitCode } = await s.cli("note", "Fix reconnect bug", "--ref", "TICKET-1");
  assert.equal(exitCode, 0);
  assert.match(output, /noted: Fix reconnect bug/);
  assert.match(output, /project: alpha/);
  assert.match(output, /block: b-[0-9a-f]{6}/);
  const home = await s.cli();
  assert.match(home.output, /note: Fix reconnect bug/);
});

test("a note before any block exists is kept as pending", async () => {
  const s = sandbox();
  const { output } = await s.cli("note", "Start", "work");
  assert.match(output, /noted: Start work/);
  assert.match(output, /pending/);
  assert.equal(readEvents(s.eventsFile).length, 1);
});

test("missing text is a usage error and writes nothing", async () => {
  const s = sandbox();
  const { output, exitCode } = await s.cli("note");
  assert.equal(exitCode, 2);
  assert.match(output, /note text is required/);
  assert.deepEqual(readEvents(s.eventsFile), []);
});

test("an unknown --block is rejected", async () => {
  const s = sandbox();
  const { output, exitCode } = await s.cli("note", "x", "--block", "b-000000");
  assert.equal(exitCode, 1);
  assert.match(output, /no block b-000000/);
});

test("a note can name the project by its report alias", async () => {
  const s = sandbox("2026-11-02T09:12:00.000Z");
  mkdirSync(s.env.HOURS_AXI_CONFIG_DIR, { recursive: true });
  writeFileSync(
    join(s.env.HOURS_AXI_CONFIG_DIR, "config.json"),
    JSON.stringify({ projects: { alpha: "CLIENT-1" } }),
  );
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  const { output } = await s.cli("note", "Review", "--project", "CLIENT-1");
  assert.match(output, /block: b-[0-9a-f]{6}/);
  assert.match((await s.cli("blocks")).output, /CLIENT-1,.*Review/);
});
