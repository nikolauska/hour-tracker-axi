import assert from "node:assert/strict";
import test from "node:test";
import { allocate, anchorOf, buildBlocks, deriveBlocks, projectName } from "../dist/blocks.js";

const CONFIG = { idleGapMinutes: 15, roundMinutes: 15 };
const T = (hhmm, day = "2026-11-02") => `${day}T${hhmm}:00.000Z`;
const ms = (minutes) => minutes * 60_000;

function activity(session, hhmm, project = "alpha", day) {
  return {
    v: 1,
    type: "activity",
    ts: T(hhmm, day),
    session,
    event: "PostToolUse",
    cwd: `/repo/${project}`,
    project,
  };
}

test("pings closer than the idle gap form one block", () => {
  const blocks = buildBlocks(
    [activity("a", "09:00"), activity("a", "09:10"), activity("a", "09:24")],
    CONFIG,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start, Date.parse(T("09:00")));
  assert.equal(blocks[0].end, Date.parse(T("09:24")));
});

test("a gap longer than the idle gap starts a new block", () => {
  const blocks = buildBlocks(
    [
      activity("a", "09:00"),
      activity("a", "09:10"),
      activity("a", "09:26"),
      activity("a", "09:30"),
    ],
    CONFIG,
  );
  assert.deepEqual(
    blocks.map((b) => [b.start, b.end]),
    [
      [Date.parse(T("09:00")), Date.parse(T("09:10"))],
      [Date.parse(T("09:26")), Date.parse(T("09:30"))],
    ],
  );
});

test("a lone ping yields no block because it has no measurable duration", () => {
  assert.deepEqual(buildBlocks([activity("a", "09:00")], CONFIG), []);
});

test("block ids are stable across rebuilds and unordered input", () => {
  const events = [activity("a", "09:10"), activity("a", "09:00")];
  const first = buildBlocks(events, CONFIG)[0].id;
  const second = buildBlocks([...events].reverse(), CONFIG)[0].id;
  assert.equal(first, second);
  assert.match(first, /^b-[0-9a-f]{6}$/);
});

test("a note attaches to the block of the same project covering its time", () => {
  const blocks = buildBlocks(
    [
      activity("a", "09:00"),
      activity("a", "09:10"),
      activity("b", "09:00", "beta"),
      activity("b", "09:10", "beta"),
      {
        v: 1,
        type: "note",
        ts: T("09:05"),
        project: "alpha",
        text: "Fix reconnect bug",
        ref: "TICKET-1",
      },
    ],
    CONFIG,
  );
  const alpha = blocks.find((b) => b.project === "alpha");
  const gh = blocks.find((b) => b.project === "beta");
  assert.deepEqual(alpha.notes, ["Fix reconnect bug"]);
  assert.deepEqual(alpha.refs, ["TICKET-1"]);
  assert.deepEqual(gh.notes, []);
});

test("edit, drop and add events change derived blocks without touching activity", () => {
  const base = [
    activity("a", "09:00"),
    activity("a", "09:10"),
    activity("a", "11:00"),
    activity("a", "11:10"),
  ];
  const [first, second] = buildBlocks(base, CONFIG);
  const blocks = buildBlocks(
    [
      ...base,
      {
        v: 1,
        type: "edit",
        ts: T("12:00"),
        block: first.id,
        end: T("09:45"),
        note: "Release prep",
      },
      { v: 1, type: "drop", ts: T("12:00"), block: second.id },
      {
        v: 1,
        type: "add",
        ts: T("12:00"),
        id: "m-abc123",
        start: T("13:00"),
        end: T("14:00"),
        project: "meetings",
        note: "Planning",
      },
    ],
    CONFIG,
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].end, Date.parse(T("09:45")));
  assert.deepEqual(blocks[0].notes, ["Release prep"]);
  assert.equal(blocks[1].id, "m-abc123");
  assert.equal(blocks[1].manual, true);
});

test("overlapping sessions in one project count real time once", () => {
  const blocks = buildBlocks(
    [
      activity("a", "09:00"),
      activity("a", "10:00"),
      activity("b", "09:30"),
      activity("b", "10:30"),
    ],
    { ...CONFIG, idleGapMinutes: 90 },
  );
  const total = allocate(blocks).reduce((sum, a) => sum + a.ms, 0);
  assert.equal(total, ms(90));
});

test("overlapping minutes are split evenly between different projects", () => {
  const blocks = buildBlocks(
    [
      activity("a", "09:00"),
      activity("a", "10:00"),
      activity("b", "09:30", "beta"),
      activity("b", "10:30", "beta"),
    ],
    { ...CONFIG, idleGapMinutes: 90 },
  );
  const byProject = {};
  for (const a of allocate(blocks)) byProject[a.project] = (byProject[a.project] ?? 0) + a.ms;
  // 30 min alone each + 30 min shared split in half.
  assert.deepEqual(byProject, { alpha: ms(45), beta: ms(45) });
});

test("a block crossing midnight is credited to both days", () => {
  const blocks = buildBlocks(
    [activity("a", "23:55", "alpha", "2026-11-02"), activity("a", "00:05", "alpha", "2026-11-03")],
    CONFIG,
  );
  const byDay = {};
  for (const a of allocate(blocks)) byDay[a.day] = (byDay[a.day] ?? 0) + a.ms;
  assert.deepEqual(byDay, { "2026-11-02": ms(5), "2026-11-03": ms(5) });
});

test("an edited note replaces earlier notes but keeps notes written after the edit", () => {
  const base = [activity("a", "09:00"), activity("a", "09:12"), activity("a", "09:24")];
  const [block] = buildBlocks(base, CONFIG);
  const note = (hhmm, text) => ({ v: 1, type: "note", ts: T(hhmm), project: "alpha", text });
  const blocks = buildBlocks(
    [
      ...base,
      note("09:05", "Agent draft"),
      { v: 1, type: "edit", ts: T("09:10"), block: block.id, note: "Release prep" },
      note("09:20", "Add changelog"),
    ],
    CONFIG,
  );
  assert.deepEqual(blocks[0].notes, ["Release prep", "Add changelog"]);
});

test("colliding block ids get a suffix so a drop hits only one block", async () => {
  const { createHash } = await import("node:crypto");
  const short = (session) =>
    createHash("sha1")
      .update(`${session}\0${T("09:00")}`)
      .digest("hex")
      .slice(0, 6);
  const seen = new Map();
  let pair;
  for (let i = 0; !pair; i++) {
    const h = short(`s${i}`);
    if (seen.has(h)) pair = [seen.get(h), `s${i}`];
    else seen.set(h, `s${i}`);
  }
  const events = pair.flatMap((session) => [
    activity(session, "09:00"),
    activity(session, "09:10"),
  ]);
  const ids = buildBlocks(events, CONFIG).map((b) => b.id);
  assert.equal(new Set(ids).size, 2);
  const kept = buildBlocks(
    [...events, { v: 1, type: "drop", ts: T("10:00"), block: ids[0] }],
    CONFIG,
  );
  assert.deepEqual(
    kept.map((b) => b.id),
    [ids[1]],
  );
});

// 09:00-09:10 and 10:00-10:10 are two blocks at a 15 min gap and one block at 60 min.
const TWO = [
  activity("a", "09:00"),
  activity("a", "09:10"),
  activity("a", "10:00"),
  activity("a", "10:10"),
];
const WIDE = { ...CONFIG, idleGapMinutes: 60 };
const dropOf = (block) => ({
  v: 1,
  type: "drop",
  ts: T("12:00"),
  block: block.id,
  anchor: anchorOf(block),
  project: block.project,
});
const spans = (blocks) =>
  blocks.map((b) => [new Date(b.start).toISOString(), new Date(b.end).toISOString()]);

test("a dropped later block stays dropped after a wider idle gap merges blocks", () => {
  const [, second] = buildBlocks(TWO, CONFIG);
  const blocks = buildBlocks([...TWO, dropOf(second)], WIDE);
  assert.deepEqual(spans(blocks), [[T("09:00"), T("09:10")]]);
});

test("a dropped earlier block does not take the next block with it after a wider gap", () => {
  const [first] = buildBlocks(TWO, CONFIG);
  const blocks = buildBlocks([...TWO, dropOf(first)], WIDE);
  assert.deepEqual(spans(blocks), [[T("10:00"), T("10:10")]]);
});

test("a dropped stretch splits a block in two when a narrower gap is used later", () => {
  const events = [...TWO, activity("a", "11:00"), activity("a", "11:10")];
  const [, middle] = buildBlocks(events, CONFIG);
  const blocks = buildBlocks([...events, dropOf(middle)], WIDE);
  assert.deepEqual(spans(blocks), [
    [T("09:00"), T("09:10")],
    [T("11:00"), T("11:10")],
  ]);
});

test("a note for a block whose id is gone lands on the block now covering that time", () => {
  const [, second] = buildBlocks(TWO, CONFIG);
  const note = {
    v: 1,
    type: "note",
    ts: T("12:00"),
    project: "alpha",
    text: "Review",
    block: second.id,
    anchor: anchorOf(second),
  };
  const { blocks, orphans } = deriveBlocks([...TWO, note], WIDE);
  assert.deepEqual(blocks[0].notes, ["Review"]);
  assert.deepEqual(orphans, []);
});

test("an edit or legacy drop whose block is gone is reported, not silently skipped", () => {
  const [, second] = buildBlocks(TWO, CONFIG);
  const { blocks, orphans } = deriveBlocks(
    [
      ...TWO,
      { v: 1, type: "edit", ts: T("12:00"), block: second.id, note: "Release" },
      { v: 1, type: "drop", ts: T("12:01"), block: second.id },
    ],
    WIDE,
  );
  assert.deepEqual(blocks[0].notes, []);
  assert.deepEqual(
    orphans.map((o) => o.type),
    ["edit", "drop"],
  );
});

test("a path key tells apart repos that share a folder name; the longest path wins", () => {
  const config = {
    ...CONFIG,
    projects: { "/work/api": "CLIENT-API", "/work/api/admin": "ADMIN", api: "OTHER" },
  };
  assert.equal(projectName(config, "api", "/work/api"), "CLIENT-API");
  assert.equal(projectName(config, "api", "/work/api/src/"), "CLIENT-API");
  assert.equal(projectName(config, "admin", "/work/api/admin/x"), "ADMIN");
  assert.equal(projectName(config, "api", "/work/api-v2"), "OTHER");
  assert.equal(projectName(config, "api", "/home/me/api"), "OTHER");
  assert.equal(projectName(config, "api"), "OTHER");
});

test("a ticket id in the branch name fills a block's refs unless one was given", () => {
  const on = (session, hhmm, branch) => ({ ...activity(session, hhmm), branch });
  const events = [
    on("a", "09:00", "feature/TICKET-1-login"),
    on("a", "09:10", "TICKET-2"),
    on("b", "11:00", "release-2026"),
    on("b", "11:10", "release-2026"),
    on("c", "13:00", "feature/TICKET-3"),
    on("c", "13:10", "feature/TICKET-3"),
    { v: 1, type: "note", ts: T("13:05"), project: "alpha", text: "x", ref: "OTHER-9" },
  ];
  const refs = (config) => buildBlocks(events, config).map((b) => b.refs);
  assert.deepEqual(refs(CONFIG), [["TICKET-1", "TICKET-2"], [], ["OTHER-9"]]);
  assert.deepEqual(refs({ ...CONFIG, branchRefs: false }), [[], [], ["OTHER-9"]]);
  const [first] = buildBlocks(events, CONFIG);
  const cleared = buildBlocks(
    [...events, { v: 1, type: "edit", ts: T("14:00"), block: first.id, ref: "" }],
    CONFIG,
  );
  assert.deepEqual(cleared[0].refs, []);
});
