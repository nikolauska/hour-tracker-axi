import type { AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { eventsPath } from "../config.js";
import { notFound, validation } from "../errors.js";
import { anchorOf } from "../blocks.js";
import { appendEvent } from "../events.js";
import { findBlock, loadState, type Deps } from "../state.js";
import { clock, dayKey, parseClock } from "../time.js";

export const EDIT_HELP = [
  'usage: hours-axi edit <block-id> [--start HH:MM] [--end HH:MM] [--project <name>] [--note "<text>"] [--ref <ticket>]',
  "flags:",
  "  --start/--end HH:MM: New times on the block's own day; a full ISO timestamp (e.g. 2026-11-03T00:30:00+02:00) sets another day",
  "  --project <name>: Credit the block to another project",
  '  --note "<text>": Replace all notes on the block; --note "" clears them',
  '  --ref <ticket>: Replace the block\'s ticket ids; --ref "" clears them',
  "notes:",
  "  Changes the user's reported hours: run only when the user asks",
  "  Stored as a correction on top of the raw log; the recorded activity itself is never rewritten",
  "",
].join("\n");

export const DROP_HELP = [
  "usage: hours-axi drop <block-id>",
  "notes:",
  "  Excludes the block from every report; run only when the user asks",
  "  `hours-axi blocks --all` still lists dropped blocks; `hours-axi restore <id>` undoes a drop",
  "",
].join("\n");

export const RESTORE_HELP = [
  "usage: hours-axi restore <block-id>",
  "notes:",
  "  Undoes `hours-axi drop`, so the block counts in reports again; run only when the user asks",
  "  Dropped block ids are listed by `hours-axi blocks --all`",
  "",
].join("\n");

export function editCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("edit", args, {
      start: { type: "string" },
      end: { type: "string" },
      project: { type: "string" },
      note: { type: "string" },
      ref: { type: "string" },
    });
    const block = requireBlock(deps, positionals, "edit");
    if (["start", "end", "project", "note", "ref"].every((k) => flags[k] === undefined)) {
      validation(
        "nothing to change",
        "Pass at least one of --start, --end, --project, --note, --ref",
      );
    }
    const day = dayKey(block.start);
    const start =
      flags.start === undefined ? block.start : time(String(flags.start), day, "--start");
    const end = flags.end === undefined ? block.end : time(String(flags.end), day, "--end");
    if (end <= start) validation("the block would end before it starts", "Check --start and --end");

    appendEvent(eventsPath(deps.env), {
      v: 1,
      type: "edit",
      ts: new Date(deps.now()).toISOString(),
      block: block.id,
      ...(flags.start !== undefined ? { start: new Date(start).toISOString() } : {}),
      ...(flags.end !== undefined ? { end: new Date(end).toISOString() } : {}),
      ...(flags.project !== undefined ? { project: String(flags.project) } : {}),
      ...(flags.note !== undefined ? { note: String(flags.note) } : {}),
      ...(flags.ref !== undefined ? { ref: String(flags.ref) } : {}),
    });
    const updated = findBlock(loadState(deps), block.id);
    return {
      edited: block.id,
      block: updated
        ? {
            project: updated.project,
            start: clock(updated.start),
            end: clock(updated.end),
            note: updated.notes.join("; ") || "(none)",
            ref: updated.refs.join(", ") || "(none)",
          }
        : "no longer listed",
    };
  };
}

export function dropCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals } = parseCommand("drop", args, {});
    // Dropping twice is an already-satisfied request, not an error.
    const already = loadState(deps).dropped.some((b) => b.id === positionals[0]);
    if (positionals.length === 1 && already)
      return { dropped: positionals[0], status: "already dropped" };
    const block = requireBlock(deps, positionals, "drop");
    const anchor = anchorOf(block);
    appendEvent(eventsPath(deps.env), {
      v: 1,
      type: "drop",
      ts: new Date(deps.now()).toISOString(),
      block: block.id,
      // The project is kept so a dropped block can still be described once its activity
      // no longer forms a block.
      ...(anchor ? { anchor, project: block.project } : {}),
    });
    return { dropped: block.id, project: block.project, day: dayKey(block.start) };
  };
}

export function restoreCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals } = parseCommand("restore", args, {});
    if (positionals.length !== 1)
      validation("exactly one block id is required", "Run `hours-axi restore <block-id>`");
    const [id] = positionals;
    const state = loadState(deps);
    const block = state.dropped.find((b) => b.id === id);
    if (!block) {
      // Restoring a block that counts already is a satisfied request, like a repeated drop.
      if (findBlock(state, id)) return { restored: id, status: "not dropped" };
      notFound(`no dropped block ${id}`, "Run `hours-axi blocks --all --day <day>` to list them");
    }
    appendEvent(eventsPath(deps.env), {
      v: 1,
      type: "restore",
      ts: new Date(deps.now()).toISOString(),
      block: id,
    });
    return { restored: id, project: block.project, day: dayKey(block.start) };
  };
}

function requireBlock(deps: Deps, positionals: string[], command: string) {
  if (positionals.length !== 1)
    validation("exactly one block id is required", `Run \`hours-axi ${command} <block-id>\``);
  const block = findBlock(loadState(deps), positionals[0]);
  if (!block)
    notFound(`no block ${positionals[0]}`, "Run `hours-axi blocks --day <day>` to list block ids");
  return block;
}

function time(value: string, day: string, flag: string): number {
  const ms = parseClock(value, day);
  if (ms === undefined)
    validation(`${flag} must be HH:MM or an ISO timestamp`, `Run \`hours-axi edit --help\``);
  return ms;
}
