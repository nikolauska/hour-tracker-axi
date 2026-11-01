import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendEvent, readEvents } from "../dist/events.js";

const sample = { v: 1, type: "note", ts: "2026-11-02T09:00:00.000Z", project: "x", text: "hi" };

test("a missing log reads as no events", () => {
  assert.deepEqual(
    readEvents(join(mkdtempSync(join(tmpdir(), "hours-")), "nope", "events.jsonl")),
    [],
  );
});

test("appended events read back in order and a torn last line is skipped", () => {
  const path = join(mkdtempSync(join(tmpdir(), "hours-")), "data", "events.jsonl");
  appendEvent(path, sample);
  appendEvent(path, { ...sample, text: "second" });
  appendFileSync(path, '{"v":1,"type":"no');
  assert.deepEqual(
    readEvents(path).map((e) => e.text),
    ["hi", "second"],
  );
});
