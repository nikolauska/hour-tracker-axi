import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// Every line carries `v` so a future format change can be read side by side with old weeks.
export interface ActivityEvent {
  v: 1;
  type: "activity";
  ts: string;
  session: string;
  event: string;
  cwd: string;
  project: string;
  branch?: string;
}

export interface NoteEvent {
  v: 1;
  type: "note";
  ts: string;
  project: string;
  text: string;
  ref?: string;
  block?: string;
}

export interface EditEvent {
  v: 1;
  type: "edit";
  ts: string;
  block: string;
  start?: string;
  end?: string;
  project?: string;
  note?: string;
}

export interface DropEvent {
  v: 1;
  type: "drop";
  ts: string;
  block: string;
}

export interface AddEvent {
  v: 1;
  type: "add";
  ts: string;
  id: string;
  start: string;
  end: string;
  project: string;
  note?: string;
}

export type HoursEvent = ActivityEvent | NoteEvent | EditEvent | DropEvent | AddEvent;

// One JSON line per write: a single small O_APPEND write is not interleaved with
// writes from parallel hook processes, so no lock is needed.
export function appendEvent(path: string, event: HoursEvent): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, { flag: "a" });
}

export function readEvents(path: string): HoursEvent[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const events: HoursEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    // A torn last line (e.g. disk full mid-write) must not make every report unreadable.
    try {
      const parsed = JSON.parse(line) as HoursEvent;
      if (parsed && parsed.v === 1 && typeof parsed.type === "string") events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}
