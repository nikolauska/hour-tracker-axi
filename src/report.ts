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
export function buildReport(state: State, from: string, to: string): Report {
  const roundMs = state.settings.roundMinutes * 60_000;
  const byId = new Map(state.blocks.map((b) => [b.id, b]));
  const groups = new Map<
    string,
    { date: string; project: string; ms: number; blockIds: string[] }
  >();
  for (const a of state.allocations) {
    if (a.day < from || a.day > to) continue;
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
        hours: Math.round(group.ms / roundMs) * (roundMs / 3_600_000),
        notes: unique(blocks.flatMap((b) => b.notes)).join("; "),
        refs: unique(blocks.flatMap((b) => b.refs)).join(", "),
      };
    });
  return { rows, totalHours: rows.reduce((sum, r) => sum + r.hours, 0), exactMs };
}

export function byProject(rows: DayRow[]): Array<{ project: string; hours: number; days: number }> {
  const totals = new Map<string, { project: string; hours: number; days: number }>();
  for (const row of rows) {
    const t = totals.get(row.project) ?? { project: row.project, hours: 0, days: 0 };
    t.hours += row.hours;
    t.days += 1;
    totals.set(row.project, t);
  }
  return [...totals.values()].sort(
    (a, b) => b.hours - a.hours || a.project.localeCompare(b.project),
  );
}

export function toCsv(rows: DayRow[]): string {
  const lines = ["date,project,hours,notes,refs"];
  for (const r of rows)
    lines.push([r.date, r.project, r.hours.toFixed(2), r.notes, r.refs].map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
