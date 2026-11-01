import assert from "node:assert/strict";
import test from "node:test";
import { sandbox } from "./support/cli.js";

// 2026-11-04 is a Wednesday, so --week covers Mon 2026-11-02 .. Sun 2026-11-08.
function week() {
  const s = sandbox("2026-11-04T18:00:00.000Z");
  // Mon: alpha 09:00-09:52 (52m -> 0.75h), with a note and ref.
  for (const t of ["09:00", "09:10", "09:20", "09:30", "09:40", "09:52"])
    s.ping("a", `2026-11-02T${t}:00.000Z`);
  s.append({
    v: 1,
    type: "note",
    ts: "2026-11-02T09:05:00.000Z",
    project: "alpha",
    text: 'Fix, then "ship"',
    ref: "TICKET-1",
  });
  // Tue: beta 10:00-10:05 (5m -> rounds to 0).
  s.ping("b", "2026-11-03T10:00:00.000Z", "beta");
  s.ping("b", "2026-11-03T10:05:00.000Z", "beta");
  // Previous week, must not appear in --week.
  s.ping("c", "2026-10-30T10:00:00.000Z");
  s.ping("c", "2026-10-30T10:10:00.000Z");
  return s;
}

test("the weekly report rounds per day and project and keeps zero rows", async () => {
  const { output, exitCode } = await week().cli("report");
  assert.equal(exitCode, 0);
  assert.match(output, /from: 2026-11-02\n\s+to: 2026-11-08/);
  assert.match(output, /hours: 0.75\n\s+exact: 57m/);
  assert.match(output, /rows\[2\]\{date,project,hours,notes,refs\}:/);
  assert.match(output, /2026-11-02,alpha,0.75,/);
  assert.match(output, /2026-11-03,beta,0,\(none\),\(none\)/);
  assert.doesNotMatch(output, /2026-10-30/);
});

test("csv output escapes notes for spreadsheets", async () => {
  const { output } = await week().cli("report", "--format", "csv");
  assert.equal(
    output.trim(),
    [
      "date,project,hours,notes,refs",
      '2026-11-02,alpha,0.75,"Fix, then ""ship""",TICKET-1',
      "2026-11-03,beta,0.00,,",
    ].join("\n"),
  );
});

test("--by project totals the rounded day rows", async () => {
  const { output } = await week().cli("report", "--by", "project");
  assert.match(output, /rows\[2\]\{project,hours,days\}:\n\s+alpha,0.75,1\n\s+beta,0,1/);
});

test("--last-week and an explicit range select other days", async () => {
  const s = week();
  assert.match((await s.cli("report", "--last-week")).output, /2026-10-30,alpha,0.25/);
  assert.match(
    (await s.cli("report", "--from", "2026-11-03", "--to", "2026-11-03")).output,
    /rows\[1\]/,
  );
});

test("an empty range is stated explicitly", async () => {
  const { output } = await sandbox().cli("report", "--day", "today");
  assert.match(output, /0 tracked hours from 2026-11-02 to 2026-11-02/);
});

test("conflicting range flags are a usage error", async () => {
  const { exitCode, output } = await sandbox().cli("report", "--week", "--day", "today");
  assert.equal(exitCode, 2);
  assert.match(output, /pick one range/);
});
