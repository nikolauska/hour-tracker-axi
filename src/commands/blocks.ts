import type { AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { validation } from "../errors.js";
import { loadState, type Deps } from "../state.js";
import { addDays, clock, duration, localMidnight, parseDay } from "../time.js";

export const BLOCKS_HELP = [
  "usage: hours-axi blocks [--day today|yesterday|YYYY-MM-DD] [--all]",
  "flags:",
  "  --day <day>: Local day to list; defaults to today",
  "  --all: Also list dropped blocks, marked dropped: true, so they can be restored",
  "notes:",
  "  time is the block's credited share: overlap with another project's block is split evenly",
  "  manual: true marks blocks added with `hours-axi add`",
  "",
].join("\n");

export function blocksCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("blocks", args, {
      day: { type: "string" },
      all: { type: "boolean" },
    });
    if (positionals.length)
      validation(`unexpected argument: ${positionals[0]}`, "Run `hours-axi blocks --help`");
    const day = parseDay((flags.day as string | undefined) ?? "today", deps.now());
    if (!day)
      validation(
        "--day must be today, yesterday or YYYY-MM-DD",
        "Run `hours-axi blocks --day 2026-01-31`",
      );

    const state = loadState(deps);
    const credited = new Map<string, number>();
    for (const a of state.allocations) {
      if (a.day === day) credited.set(a.blockId, (credited.get(a.blockId) ?? 0) + a.ms);
    }
    const rows = state.blocks
      .filter((b) => credited.has(b.id))
      .map((b) => ({
        id: b.id,
        project: b.project,
        start: clock(b.start),
        end: clock(b.end),
        time: duration(credited.get(b.id) ?? 0),
        note: b.notes.join("; ") || "(none)",
        ref: b.refs.join(", ") || "(none)",
        manual: b.manual,
        ...(flags.all ? { dropped: false } : {}),
      }));
    if (flags.all) {
      const [from, to] = [localMidnight(day), localMidnight(addDays(day, 1))];
      for (const b of state.dropped.filter((b) => b.start < to && b.end > from)) {
        rows.push({
          id: b.id,
          project: b.project,
          start: clock(b.start),
          end: clock(b.end),
          time: "0m",
          note: b.notes.join("; ") || "(none)",
          ref: b.refs.join(", ") || "(none)",
          manual: b.manual,
          dropped: true,
        });
      }
    }
    if (rows.length === 0)
      return { day, blocks: `0 ${flags.all ? "blocks, dropped or not," : "blocks"} on ${day}` };
    return {
      day,
      blocks: rows,
      help: [
        'Run `hours-axi edit <id> --start HH:MM --end HH:MM --note "<text>" --project <name>` to fix a block (only when the user asks)',
        "Run `hours-axi drop <id>` to exclude a block from reports (only when the user asks)",
        ...(flags.all
          ? [
              "Run `hours-axi restore <id>` to count a dropped block again (only when the user asks)",
            ]
          : []),
      ],
    };
  };
}
