import assert from "node:assert/strict";
import test from "node:test";
import { sandbox } from "./support/cli.js";

test("add records time no agent saw and it shows up in reports", async () => {
  const s = sandbox("2026-11-02T18:00:00.000Z");
  const { output, exitCode } = await s.cli(
    "add",
    "--from",
    "13:00",
    "--to",
    "14:30",
    "--project",
    "beta",
    "--note",
    "Planning",
  );
  assert.equal(exitCode, 0);
  assert.match(output, /added: m-[0-9a-f]{6}/);
  assert.match((await s.cli("report", "--day", "today")).output, /2026-11-02,beta,1.5,Planning/);
  assert.match((await s.cli("blocks")).output, /,true\n/);
});

test("add defaults the project to the current repo", async () => {
  const s = sandbox();
  assert.match((await s.cli("add", "--from", "08:00", "--to", "08:30")).output, /project: alpha/);
});

test("add validates times", async () => {
  const s = sandbox();
  assert.equal((await s.cli("add", "--from", "10:00")).exitCode, 2);
  assert.equal((await s.cli("add", "--from", "10:00", "--to", "09:00")).exitCode, 2);
  assert.equal((await s.cli("add", "--from", "25:00", "--to", "26:00")).exitCode, 2);
});

test("add takes a ticket id and ISO timestamps that cross midnight", async () => {
  const s = sandbox("2026-11-03T12:00:00.000Z");
  const { output, exitCode } = await s.cli(
    "add",
    "--from",
    "2026-11-02T23:00:00.000Z",
    "--to",
    "2026-11-03T01:00:00.000Z",
    "--note",
    "Release",
    "--ref",
    "TICKET-1",
  );
  assert.equal(exitCode, 0, output);
  const csv = (
    await s.cli("report", "--from", "2026-11-02", "--to", "2026-11-03", "--format", "csv")
  ).output;
  assert.match(
    csv,
    /2026-11-02,alpha,1\.00,Release,TICKET-1\n2026-11-03,alpha,1\.00,Release,TICKET-1/,
  );
});
