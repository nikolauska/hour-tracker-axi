import { allocate, deriveBlocks, type Allocation, type Block, type Orphan } from "./blocks.js";
import { eventsPath, loadSettings, type Settings } from "./config.js";
import { readEvents, type HoursEvent } from "./events.js";

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
  const settings = loadSettings(deps.env);
  const events = readEvents(eventsPath(deps.env));
  const { blocks, dropped, orphans } = deriveBlocks(events, settings);
  return { settings, events, blocks, dropped, orphans, allocations: allocate(blocks) };
}

export function findBlock(state: State, id: string): Block | undefined {
  return state.blocks.find((block) => block.id === id);
}
