import type { AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { validation } from "../errors.js";
import { buildReport, byProject, toCsv } from "../report.js";
import { loadState, type Deps } from "../state.js";
import { addDays, dayKey, duration, monthRange, parseDay, weekStart } from "../time.js";

export const REPORT_HELP = [
  "usage: hours-axi report [--week | --last-week | --month [YYYY-MM] | --last-month | --day <day> | --from <day> --to <day>] [--by day|project] [--format toon|csv]",
  "flags:",
  "  --week: This Monday-to-Sunday week (default)",
  "  --last-week: The previous Monday-to-Sunday week",
  "  --month [YYYY-MM]: A calendar month; this month when no month is given",
  "  --last-month: The previous calendar month",
  "  --day <day>: One day: today, yesterday or YYYY-MM-DD",
  "  --from <day> --to <day>: Inclusive range of local days",
  "  --by day|project: One row per day and project (default), or totals per project",
  "  --format toon|csv: csv prints day rows for pasting into a reporting tool",
  "notes:",
  "  hours are rounded per day and project to the configured step (default 15 min); exact is the unrounded sum",
  "  A row can round to 0 when little time was tracked; it is kept so nothing disappears silently",
  "  Only agent-observed time is included; add meetings and other work with `hours-axi add`",
  "",
].join("\n");

export function reportCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("report", normalizeMonth(args), {
      week: { type: "boolean" },
      "last-week": { type: "boolean" },
      month: { type: "string" },
      "last-month": { type: "boolean" },
      day: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      by: { type: "string" },
      format: { type: "string" },
    });
    if (positionals.length)
      validation(`unexpected argument: ${positionals[0]}`, "Run `hours-axi report --help`");
    const [from, to] = range(flags, deps.now());
    const by = (flags.by as string | undefined) ?? "day";
    const format = (flags.format as string | undefined) ?? "toon";
    if (by !== "day" && by !== "project")
      validation("--by must be day or project", "Run `hours-axi report --by project`");
    if (format !== "toon" && format !== "csv")
      validation("--format must be toon or csv", "Run `hours-axi report --format csv`");
    if (format === "csv" && by !== "day")
      validation("--format csv only supports --by day", "Run `hours-axi report --format csv`");

    const report = buildReport(loadState(deps), from, to);
    if (format === "csv") return toCsv(report.rows);

    const range_ = { from, to };
    if (report.rows.length === 0)
      return { range: range_, rows: `0 tracked hours from ${from} to ${to}` };
    return {
      range: range_,
      total: { hours: report.totalHours, exact: duration(report.exactMs) },
      rows:
        by === "project"
          ? byProject(report.rows)
          : report.rows.map((r) => ({
              ...r,
              notes: r.notes || "(none)",
              refs: r.refs || "(none)",
            })),
      help:
        by === "day"
          ? ["Run `hours-axi report --format csv` with the same range flags for a pasteable CSV"]
          : ["Run `hours-axi report` with the same range flags for per-day rows with notes"],
    };
  };
}

function range(flags: Record<string, string | boolean | undefined>, now: number): [string, string] {
  const chosen = ["week", "last-week", "month", "last-month", "day", "from"].filter(
    (k) => flags[k] !== undefined,
  );
  if (chosen.length > 1)
    validation(
      "pick one range: --week, --last-week, --month, --last-month, --day or --from/--to",
      "Run `hours-axi report --help`",
    );
  if (flags.to !== undefined && flags.from === undefined)
    validation("--to needs --from", "Run `hours-axi report --from <day> --to <day>`");
  if (flags["last-week"]) {
    const start = addDays(weekStart(now), -7);
    return [start, addDays(start, 6)];
  }
  if (flags.month !== undefined) {
    const month = flags.month === CURRENT ? dayKey(now).slice(0, 7) : String(flags.month);
    const days = monthRange(month);
    if (!days) validation("--month must be YYYY-MM", "Run `hours-axi report --month 2026-01`");
    return days;
  }
  if (flags["last-month"]) {
    const [first] = monthRange(dayKey(now).slice(0, 7)) as [string, string];
    return monthRange(addDays(first, -1).slice(0, 7)) as [string, string];
  }
  if (flags.day !== undefined) {
    const day = dayFlag(String(flags.day), "--day", now);
    return [day, day];
  }
  if (flags.from !== undefined) {
    const from = dayFlag(String(flags.from), "--from", now);
    const to = flags.to === undefined ? from : dayFlag(String(flags.to), "--to", now);
    if (to < from)
      validation("--to is before --from", "Run `hours-axi report --from <day> --to <later day>`");
    return [from, to];
  }
  const start = weekStart(now);
  return [start, addDays(start, 6)];
}

function dayFlag(value: string, flag: string, now: number): string {
  const day = parseDay(value, now);
  if (!day)
    validation(`${flag} must be today, yesterday or YYYY-MM-DD`, "Run `hours-axi report --help`");
  return day;
}

const CURRENT = "current";

// --month takes an optional value, which node:util parseArgs can't express, so the bare
// flag is rewritten to mean the current month before parsing.
function normalizeMonth(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--month") {
      out.push(args[i]);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.push(`--month=${next}`);
      i++;
    } else out.push(`--month=${CURRENT}`);
  }
  return out;
}
