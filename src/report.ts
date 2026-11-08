import type { State } from "./state.js";

export interface DayRow {
  date: string;
  project: string;
  hours: number;
  notes: string;
  refs: string;
}

export interface Report {
  rows: DayRow[];
  totalHours: number;
  exactMs: number;
}

// Rounds each day+project total once, because that is the unit hour reports are entered in;
// rounding per block would inflate days with many short blocks.
export function buildReport(state: State, from: string, to: string, project?: string): Report {
  const roundMs = state.settings.roundMinutes * 60_000;
  // Overlap splitting divides milliseconds, so an exact 15 min can come out a hair above;
  // without the tolerance rounding up would add a whole step for float noise.
  const steps =
    state.settings.roundMode === "up"
      ? (ms: number) => Math.ceil(ms / roundMs - 1e-9)
      : (ms: number) => Math.round(ms / roundMs);
  const byId = new Map(state.blocks.map((b) => [b.id, b]));
  const groups = new Map<
    string,
    { date: string; project: string; ms: number; blockIds: string[] }
  >();
  for (const a of state.allocations) {
    if (a.day < from || a.day > to) continue;
    if (project !== undefined && a.project !== project) continue;
    const key = `${a.day}\0${a.project}`;
    const group = groups.get(key) ?? { date: a.day, project: a.project, ms: 0, blockIds: [] };
    group.ms += a.ms;
    if (!group.blockIds.includes(a.blockId)) group.blockIds.push(a.blockId);
    groups.set(key, group);
  }

  let exactMs = 0;
  const rows = [...groups.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project))
    .map((group) => {
      exactMs += group.ms;
      const blocks = group.blockIds.map((id) => byId.get(id)).filter((b) => b !== undefined);
      return {
        date: group.date,
        project: group.project,
        hours: twoDecimals(steps(group.ms) * (roundMs / 3_600_000)),
        notes: unique(blocks.flatMap((b) => b.notes)).join("; "),
        refs: unique(blocks.flatMap((b) => b.refs)).join(", "),
      };
    });
  return { rows, totalHours: twoDecimals(rows.reduce((sum, r) => sum + r.hours, 0)), exactMs };
}

export function byProject(rows: DayRow[]): Array<{ project: string; hours: number; days: number }> {
  const totals = new Map<string, { project: string; hours: number; days: number }>();
  for (const row of rows) {
    const t = totals.get(row.project) ?? { project: row.project, hours: 0, days: 0 };
    t.hours += row.hours;
    t.days += 1;
    totals.set(row.project, t);
  }
  for (const t of totals.values()) t.hours = twoDecimals(t.hours);
  return [...totals.values()].sort(
    (a, b) => b.hours - a.hours || a.project.localeCompare(b.project),
  );
}

export function toCsv(rows: DayRow[]): string {
  const lines = ["date,project,hours,notes,refs"];
  for (const r of rows)
    lines.push([r.date, r.project, r.hours.toFixed(2), r.notes, r.refs].map(csvCell).join(","));
  // No trailing newline: the CLI runtime adds one, and a blank last line trips some importers.
  return lines.join("\n");
}

export function toProjectCsv(rows: ReturnType<typeof byProject>): string {
  const lines = ["project,hours,days"];
  for (const r of rows)
    lines.push([r.project, r.hours.toFixed(2), String(r.days)].map(csvCell).join(","));
  return lines.join("\n");
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// A step that doesn't divide an hour (e.g. 10 min) gives 0.8333…, and float sums drift
// (0.1 + 0.2); two decimals matches the CSV and what hour reports take.
function twoDecimals(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
