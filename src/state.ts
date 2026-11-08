import { allocate, deriveBlocks, type Allocation, type Block, type Orphan } from "./blocks.js";
import { eventsPath, loadSettings, type Settings } from "./config.js";
import { appendEvent, readEvents, type HoursEvent } from "./events.js";

export type Env = Record<string, string | undefined>;

// Injected so tests control the clock, the data location and the working directory.
export interface Deps {
  env: Env;
  now: () => number;
  cwd: string;
}

export interface State {
  settings: Settings;
  events: HoursEvent[];
  blocks: Block[];
  dropped: Block[];
  orphans: Orphan[];
  allocations: Allocation[];
}

export function loadState(deps: Deps): State {
  return stateFrom(loadSettings(deps.env), readEvents(eventsPath(deps.env)));
}

export function stateFrom(settings: Settings, events: HoursEvent[]): State {
  const { blocks, dropped, orphans } = deriveBlocks(events, settings);
  return { settings, events, blocks, dropped, orphans, allocations: allocate(blocks) };
}

// Appends and rebuilds from the events already in memory: parsing the log is the costliest
// step of a command, so a command that shows its own result must not read the file twice.
export function record(deps: Deps, state: State, event: HoursEvent): State {
  appendEvent(eventsPath(deps.env), event);
  return stateFrom(state.settings, [...state.events, event]);
}

export function findBlock(state: State, id: string): Block | undefined {
  return state.blocks.find((block) => block.id === id);
}
