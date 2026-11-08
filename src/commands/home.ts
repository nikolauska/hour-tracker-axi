import { loadState, type Deps } from "../state.js";
import { clock, dayKey, duration } from "../time.js";

export function home(deps: Deps): Record<string, unknown> {
  const state = loadState(deps);
  const now = deps.now();
  const today = dayKey(now);

  if (state.events.length === 0) {
    return {
      tracking: "no events recorded yet",
      help: [
        "Run `hours-axi setup claude` once to record Claude Code working time automatically (edits Claude Code user settings; only when the user asks)",
        'Run `hours-axi note "<what you are working on>"` to describe the current work',
        "Run `hours-axi --help` for all commands",
      ],
    };
  }

  const credited = new Map<string, number>();
  for (const a of state.allocations) {
    if (a.day === today) credited.set(a.blockId, (credited.get(a.blockId) ?? 0) + a.ms);
  }
  const todays = state.blocks.filter((b) => credited.has(b.id));
  const total = [...credited.values()].reduce((sum, ms) => sum + ms, 0);
  // A block still counts as running while its last ping is within the idle gap.
  const gap = state.settings.idleGapMinutes * 60_000;
  const active = todays.filter((b) => now - b.end <= gap).at(-1);
  const unlabeled = todays.filter((b) => b.notes.length === 0);

  const help: string[] = [];
  if (unlabeled.length > 0) {
    help.push(
      'Run `hours-axi note "<what was done>" --block <id>` to label a block that has no note',
    );
  }
  if (state.orphans.length > 0) {
    help.push(
      "Orphaned corrections point at blocks that no longer exist, usually after idleGapMinutes changed; run `hours-axi blocks --day <day>` and redo them (only when the user asks)",
    );
  }
  help.push("Run `hours-axi report --week` for this week's totals");

  return {
    today,
    total: duration(total),
    active: active
      ? {
          id: active.id,
          project: active.project,
          since: clock(active.start),
          note: active.notes.join("; ") || "(none)",
        }
      : "none",
    blocks: todays.length
      ? todays.map((b) => ({
          id: b.id,
          project: b.project,
          start: clock(b.start),
          end: clock(b.end),
          time: duration(credited.get(b.id) ?? 0),
          note: b.notes.join("; ") || "(none)",
        }))
      : `0 blocks on ${today}`,
    ...(state.orphans.length > 0
      ? {
          orphaned: state.orphans.map((o) => ({
            type: o.type,
            block: o.block,
            recorded: `${dayKey(Date.parse(o.ts))} ${clock(Date.parse(o.ts))}`,
          })),
        }
      : {}),
    help,
  };
}
