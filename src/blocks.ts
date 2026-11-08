import { createHash } from "node:crypto";
import type { ActivityEvent, Anchor, DropEvent, HoursEvent } from "./events.js";
import { dayKey, nextLocalMidnight } from "./time.js";

export interface Config {
  idleGapMinutes: number;
  roundMinutes: number;
  // Repo name, or absolute path prefix, → name used in reports.
  projects?: Record<string, string>;
}

// Two repos can share a folder name (work/api and personal/api), so an absolute path key
// tells them apart; the longest matching path wins, then a plain repo-name key.
export function projectName(config: Config, project: string, cwd?: string): string {
  const projects = config.projects ?? {};
  if (cwd) {
    const dir = `${cwd.replace(/\/+$/, "")}/`;
    const match = Object.keys(projects)
      .filter((key) => key.startsWith("/") && dir.startsWith(`${key.replace(/\/+$/, "")}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (match !== undefined) return projects[match];
  }
  return projects[project] ?? project;
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
  // First and last recorded activity, before any edit; what a correction's anchor points at.
  raw?: { start: number; end: number };
}

// A correction whose block no longer exists, usually because idleGapMinutes changed and
// the blocks were split differently. Surfaced so it never stops applying unnoticed.
export interface Orphan {
  type: "edit" | "drop" | "note";
  block: string;
  ts: string;
}

export interface Derived {
  blocks: Block[];
  // Blocks currently left out by a drop, so they can be shown and restored.
  dropped: Block[];
  orphans: Orphan[];
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
  return deriveBlocks(events, config).blocks;
}

export function deriveBlocks(events: HoursEvent[], config: Config): Derived {
  const gap = config.idleGapMinutes * 60_000;
  // Aliases are resolved here, on read, so renaming a project in config fixes past weeks too,
  // and a note or edit can use either the repo name or the report name.
  const name = (project: string, cwd?: string) => projectName(config, project, cwd);
  // Drops and restores are settled first, in log order, because an anchored drop has to be
  // known before activity is grouped into blocks.
  const drops = new Map<string, DropEvent>();
  for (const event of sortByTs(events)) {
    if (event.type === "drop") drops.set(event.block, event);
    else if (event.type === "restore") drops.delete(event.block);
  }
  // An anchored drop removes the activity itself rather than a block id, so it keeps covering
  // the same time however the idle gap later splits or merges blocks.
  const excluded = [...drops.values()].flatMap((d) => (d.anchor ? [d.anchor] : []));
  const blocks = activityBlocks(events, gap, name, excluded);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const orphans: Orphan[] = [];

  for (const event of events) {
    if (event.type === "add") {
      const block: Block = {
        id: event.id,
        project: name(event.project, event.cwd),
        start: Date.parse(event.start),
        end: Date.parse(event.end),
        notes: event.note ? [event.note] : [],
        refs: event.ref ? [event.ref] : [],
        manual: true,
      };
      blocks.push(block);
      byId.set(block.id, block);
    }
  }

  // One pass in log order: a correction only overrides what was recorded before it, so an
  // agent note written after `edit --note` is still kept on the block.
  for (const event of sortByTs(events)) {
    if (event.type === "note") {
      let block: Block | undefined;
      if (event.block) {
        // A note only adds text, so landing on whichever block now covers that time is safe.
        block = byId.get(event.block) ?? (event.anchor && covering(blocks, event.anchor));
        if (!block) orphans.push({ type: "note", block: event.block, ts: event.ts });
      } else
        block = blockForNote(blocks, name(event.project, event.cwd), Date.parse(event.ts), gap);
      if (!block) continue;
      if (!block.notes.includes(event.text)) block.notes.push(event.text);
      if (event.ref && !block.refs.includes(event.ref)) block.refs.push(event.ref);
    } else if (event.type === "edit") {
      // No fallback for edits: moving a start or project change onto a differently split
      // block could rewrite time the user never touched, so a lost target is reported instead.
      const block = byId.get(event.block);
      if (!block) {
        orphans.push({ type: "edit", block: event.block, ts: event.ts });
        continue;
      }
      if (event.start) block.start = Date.parse(event.start);
      if (event.end) block.end = Date.parse(event.end);
      if (event.project) block.project = name(event.project);
      if (event.note !== undefined) block.notes = event.note ? [event.note] : [];
      if (event.ref !== undefined) block.refs = event.ref ? [event.ref] : [];
    }
  }

  const dropped: Block[] = [];
  for (const drop of drops.values()) {
    if (drop.anchor) {
      dropped.push(fromAnchor(drop.block, drop.anchor, name(drop.project ?? "unknown")));
      continue;
    }
    const block = byId.get(drop.block);
    if (block) dropped.push(block);
    else orphans.push({ type: "drop", block: drop.block, ts: drop.ts });
  }
  const droppedIds = new Set(dropped.map((b) => b.id));
  const byStart = (a: Block, b: Block) => a.start - b.start || a.id.localeCompare(b.id);
  return {
    blocks: blocks
      .filter((block) => !droppedIds.has(block.id) && block.end > block.start)
      .sort(byStart),
    dropped: dropped.sort(byStart),
    orphans,
  };
}

// The anchor that a correction should store for this block, if it has recorded activity.
export function anchorOf(block: Block): Anchor | undefined {
  if (!block.session || !block.raw) return undefined;
  return {
    session: block.session,
    start: new Date(block.raw.start).toISOString(),
    end: new Date(block.raw.end).toISOString(),
  };
}

function fromAnchor(id: string, anchor: Anchor, project: string): Block {
  const [start, end] = [Date.parse(anchor.start), Date.parse(anchor.end)];
  return {
    id,
    project,
    session: anchor.session,
    start,
    end,
    notes: [],
    refs: [],
    manual: false,
    raw: { start, end },
  };
}

function covering(blocks: Block[], anchor: Anchor): Block | undefined {
  const [from, to] = [Date.parse(anchor.start), Date.parse(anchor.end)];
  const overlap = (b: Block) =>
    b.raw ? Math.min(to, b.raw.end) - Math.max(from, b.raw.start) : -1;
  return blocks
    .filter((b) => b.session === anchor.session && overlap(b) >= 0)
    .sort((a, b) => overlap(b) - overlap(a))[0];
}

function activityBlocks(
  events: HoursEvent[],
  gap: number,
  name: (project: string, cwd?: string) => string,
  excluded: Anchor[],
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
        project: mostFrequent(run.map((e) => name(e.project, e.cwd))),
        session,
        start,
        end,
        notes: [],
        refs: [],
        manual: false,
        raw: { start, end },
      });
    };
    const holes = excluded
      .filter((a) => a.session === session)
      .map((a) => [Date.parse(a.start), Date.parse(a.end)]);
    for (const event of list) {
      const ts = Date.parse(event.ts);
      // A dropped stretch is a hard break: a wider idle gap must not bridge the time around
      // it and quietly count the dropped minutes again.
      if (holes.some(([from, to]) => ts >= from && ts <= to)) {
        flush();
        run = [];
        continue;
      }
      const last = run[run.length - 1];
      if (last && ts - Date.parse(last.ts) > gap) {
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
