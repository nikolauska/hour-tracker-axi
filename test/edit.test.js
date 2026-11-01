import assert from "node:assert/strict";
import test from "node:test";
import { readEvents } from "../dist/events.js";
import { sandbox } from "./support/cli.js";

function withBlock() {
  const s = sandbox("2026-11-02T18:00:00.000Z");
  s.ping("a", "2026-11-02T09:00:00.000Z");
  s.ping("a", "2026-11-02T09:10:00.000Z");
  return s;
}

async function blockId(s) {
  return /b-[0-9a-f]{6}/.exec((await s.cli("blocks")).output)[0];
}

test("edit changes times, project and note without rewriting activity", async () => {
  const s = withBlock();
  const id = await blockId(s);
  const before = readEvents(s.eventsFile).filter((e) => e.type === "activity");
  const { output, exitCode } = await s.cli(
    "edit",
    id,
    "--end",
    "10:00",
    "--project",
    "beta",
    "--note",
    "Review",
  );
  assert.equal(exitCode, 0);
  assert.match(output, /project: beta\n\s+start: "09:00"\n\s+end: "10:00"\n\s+note: Review/);
  assert.deepEqual(
    readEvents(s.eventsFile).filter((e) => e.type === "activity"),
    before,
  );
  assert.match((await s.cli("report", "--day", "today")).output, /2026-11-02,beta,1,Review/);
});

test("edit rejects an end before the start", async () => {
  const s = withBlock();
  const { exitCode, output } = await s.cli("edit", await blockId(s), "--end", "08:00");
  assert.equal(exitCode, 2);
  assert.match(output, /end before it starts/);
});

test("edit without changes is a usage error", async () => {
  const s = withBlock();
  assert.equal((await s.cli("edit", await blockId(s))).exitCode, 2);
});

test("drop removes a block from reports", async () => {
  const s = withBlock();
  const id = await blockId(s);
  assert.match((await s.cli("drop", id)).output, new RegExp(`dropped: ${id}`));
  assert.match((await s.cli("blocks")).output, /0 blocks on 2026-11-02/);
  const again = await s.cli("drop", id);
  assert.equal(again.exitCode, 0);
  assert.match(again.output, /already dropped/);
  assert.equal((await s.cli("drop", "b-000000")).exitCode, 1);
});
