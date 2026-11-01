import { randomBytes } from "node:crypto";
import type { AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { eventsPath } from "../config.js";
import { validation } from "../errors.js";
import { appendEvent } from "../events.js";
import { detectProject } from "../project.js";
import type { Deps } from "../state.js";
import { clock, parseClock, parseDay } from "../time.js";

export const ADD_HELP = [
  'usage: hours-axi add --from HH:MM --to HH:MM [--day <day>] [--project <name>] [--note "<text>"]',
  "flags:",
  "  --from/--to HH:MM: Start and end on the given day",
  "  --day <day>: today (default), yesterday or YYYY-MM-DD",
  "  --project <name>: Defaults to the current directory's repo",
  '  --note "<text>": What the time was spent on',
  "notes:",
  "  For work no agent saw, like meetings or calls; run only when the user asks",
  "  Overlap with agent blocks is split like any other overlap",
  "",
].join("\n");

export function addCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("add", args, {
      from: { type: "string" },
      to: { type: "string" },
      day: { type: "string" },
      project: { type: "string" },
      note: { type: "string" },
    });
    if (positionals.length)
      validation(`unexpected argument: ${positionals[0]}`, "Run `hours-axi add --help`");
    if (flags.from === undefined || flags.to === undefined) {
      validation("--from and --to are required", "Run `hours-axi add --from 13:00 --to 14:00`");
    }
    const day = parseDay((flags.day as string | undefined) ?? "today", deps.now());
    if (!day)
      validation("--day must be today, yesterday or YYYY-MM-DD", "Run `hours-axi add --help`");
    const start = parseClock(String(flags.from), day);
    const end = parseClock(String(flags.to), day);
    if (start === undefined || end === undefined)
      validation("--from/--to must be HH:MM", "Run `hours-axi add --help`");
    if (end <= start) validation("--to must be after --from", "Run `hours-axi add --help`");

    // Random rather than derived ids: two identical manual entries are two real meetings.
    const id = `m-${randomBytes(3).toString("hex")}`;
    const project = (flags.project as string | undefined) ?? detectProject(deps.cwd).project;
    appendEvent(eventsPath(deps.env), {
      v: 1,
      type: "add",
      ts: new Date(deps.now()).toISOString(),
      id,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      project,
      ...(flags.note ? { note: String(flags.note) } : {}),
    });
    return { added: id, day, project, start: clock(start), end: clock(end) };
  };
}
