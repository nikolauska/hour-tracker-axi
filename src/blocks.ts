import { createHash } from "node:crypto";
import type { ActivityEvent, HoursEvent } from "./events.js";
import { dayKey, nextLocalMidnight } from "./time.js";

export interface Config {
  idleGapMinutes: number;
  roundMinutes: number;
  // Repo name → name used in reports.
  projects?: Record<string, string>;
}

export interface Block {
  id: string;
  project: string;
  session?: string;
  start: number;
  end: number;
  notes: string[];
  refs: string[];
  manual: boolean;
}

export interface Allocation {
  day: string;
  blockId: string;
  project: string;
  ms: number;
}

// Blocks are always derived from the raw log, so changing a rule (like the idle gap)
// recalculates old weeks correctly instead of being stuck with stored results.
export function buildBlocks(events: HoursEvent[], config: Config): Block[] {
  const gap = config.idleGapMinutes * 60_000;
  // Aliases are resolved here, on read, so renaming a project in config fixes past weeks too,
  // and a note or edit can use either the repo name or the report name.
  const name = (project: string) => config.projects?.[project] ?? project;
  const blocks = activityBlocks(events, gap, name);
  const byId = new Map(blocks.map((block) => [block.id, block]));

  for (const event of events) {
    if (event.type === "add") {
      const block: Block = {
        id: event.id,
        project: name(event.project),
        start: Date.parse(event.start),
        end: Date.parse(event.end),
        notes: event.note ? [event.note] : [],
        refs: [],
        manual: true,
      };
      blocks.push(block);
      byId.set(block.id, block);
    }
  }

  // One pass in log order: a correction only overrides what was recorded before it, so an
  // agent note written after `edit --note` is still kept on the block.
  const dropped = new Set<string>();
  for (const event of sortByTs(events)) {
    if (event.type === "note") {
      const block = event.block
        ? byId.get(event.block)
        : blockForNote(blocks, name(event.project), Date.parse(event.ts), gap);
      if (!block) continue;
      if (!block.notes.includes(event.text)) block.notes.push(event.text);
      if (event.ref && !block.refs.includes(event.ref)) block.refs.push(event.ref);
    } else if (event.type === "drop") {
      dropped.add(event.block);
    } else if (event.type === "edit") {
      const block = byId.get(event.block);
      if (!block) continue;
      if (event.start) block.start = Date.parse(event.start);
      if (event.end) block.end = Date.parse(event.end);
      if (event.project) block.project = name(event.project);
      if (event.note !== undefined) block.notes = event.note ? [event.note] : [];
    }
  }

  return blocks
    .filter((block) => !dropped.has(block.id) && block.end > block.start)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

function activityBlocks(
  events: HoursEvent[],
  gap: number,
  name: (project: string) => string,
): Block[] {
  const bySession = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    if (event.type !== "activity") continue;
    const list = bySession.get(event.session) ?? [];
    list.push(event);
    bySession.set(event.session, list);
  }

  const blocks: Block[] = [];
  for (const [session, list] of bySession) {
    list.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    let run: ActivityEvent[] = [];
    const flush = () => {
      if (run.length < 2) return;
      const start = Date.parse(run[0].ts);
      const end = Date.parse(run[run.length - 1].ts);
      if (end <= start) return;
      blocks.push({
        id: blockId(session, run[0].ts),
        // A session can cd between repos; the most frequent project is what the time was spent on.
        project: mostFrequent(run.map((e) => name(e.project))),
        session,
        start,
        end,
        notes: [],
        refs: [],
        manual: false,
      });
    };
    for (const event of list) {
      const last = run[run.length - 1];
      if (last && Date.parse(event.ts) - Date.parse(last.ts) > gap) {
        flush();
        run = [];
      }
      run.push(event);
    }
    flush();
  }
  return withUniqueIds(blocks);
}

// The short hash can collide, and a shared id would let one drop or edit hit two blocks.
// The earliest block keeps the plain id; later ones get a suffix. New activity is always
// later than what is logged, so an id that was already shown never changes.
function withUniqueIds(blocks: Block[]): Block[] {
  blocks.sort((a, b) => a.start - b.start || (a.session ?? "").localeCompare(b.session ?? ""));
  const seen = new Map<string, number>();
  for (const block of blocks) {
    const count = (seen.get(block.id) ?? 0) + 1;
    seen.set(block.id, count);
    if (count > 1) block.id = `${block.id}-${count}`;
  }
  return blocks;
}

export function blockForNote(
  blocks: Block[],
  project: string,
  ts: number,
  gap: number,
): Block | undefined {
  // The note command runs inside a tool call, so it lands within (or right before) its block.
  return blocks
    .filter((b) => b.project === project && ts >= b.start - gap && ts <= b.end + gap)
    .sort((a, b) => b.start - a.start)[0];
}

function blockId(session: string, ts: string): string {
  return `b-${createHash("sha1").update(`${session}\0${ts}`).digest("hex").slice(0, 6)}`;
}

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

function sortByTs<T extends { ts: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

// Credits each block with its share of real time: per local day, every moment is counted
// once, split evenly between the projects active at that moment (and between the blocks of
// one project), so a day's total can never exceed the wall-clock time worked.
export function allocate(blocks: Block[]): Allocation[] {
  const pieces = blocks.flatMap((block) => splitAtMidnight(block));
  const byDay = new Map<string, typeof pieces>();
  for (const piece of pieces) {
    const list = byDay.get(piece.day) ?? [];
    list.push(piece);
    byDay.set(piece.day, list);
  }

  const credit = new Map<string, Allocation>();
  for (const [day, list] of byDay) {
    const cuts = [...new Set(list.flatMap((p) => [p.start, p.end]))].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const [from, to] = [cuts[i], cuts[i + 1]];
      const active = list.filter((p) => p.start <= from && p.end >= to);
      if (active.length === 0) continue;
      const perProject = new Map<string, number>();
      for (const p of active)
        perProject.set(p.block.project, (perProject.get(p.block.project) ?? 0) + 1);
      for (const p of active) {
        const share = (to - from) / perProject.size / (perProject.get(p.block.project) ?? 1);
        const key = `${day}\0${p.block.id}`;
        const entry = credit.get(key) ?? {
          day,
          blockId: p.block.id,
          project: p.block.project,
          ms: 0,
        };
        entry.ms += share;
        credit.set(key, entry);
      }
    }
  }
  return [...credit.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function splitAtMidnight(
  block: Block,
): Array<{ block: Block; day: string; start: number; end: number }> {
  const pieces = [];
  let start = block.start;
  while (start < block.end) {
    const end = Math.min(block.end, nextLocalMidnight(start));
    pieces.push({ block, day: dayKey(start), start, end });
    start = end;
  }
  return pieces;
}
