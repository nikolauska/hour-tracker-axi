import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { Config } from "./blocks.js";

export interface Settings extends Config {
  // Repo name → name used in reports, for when the reporting tool expects client/project codes.
  projects: Record<string, string>;
}

export const DEFAULTS: Settings = { idleGapMinutes: 15, roundMinutes: 15, projects: {} };

type Env = Record<string, string | undefined>;

// Data lives outside every repo so tracking never shows up in a project's git status.
export function dataDir(env: Env = process.env): string {
  if (env.HOURS_AXI_DATA_DIR) return env.HOURS_AXI_DATA_DIR;
  const base = env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share");
  return join(base, "hours-axi");
}

export function eventsPath(env: Env = process.env): string {
  return join(dataDir(env), "events.jsonl");
}

export function configPath(env: Env = process.env): string {
  if (env.HOURS_AXI_CONFIG_DIR) return join(env.HOURS_AXI_CONFIG_DIR, "config.json");
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(base, "hours-axi", "config.json");
}

export function loadSettings(env: Env = process.env): Settings {
  const path = configPath(env);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { ...DEFAULTS };
  }
  let parsed: Partial<Settings>;
  try {
    parsed = JSON.parse(raw) as Partial<Settings>;
  } catch {
    throw new AxiError(`config is not valid JSON: ${path}`, "CONFIG_ERROR", [
      `Fix or remove ${path}`,
    ]);
  }
  // Shape is checked up front so a hand-edited config fails with a pointer to the file
  // instead of a TypeError deep inside block building.
  if (!isObject(parsed)) {
    throw new AxiError(`config must be a JSON object: ${path}`, "CONFIG_ERROR", [`Fix ${path}`]);
  }
  const projects = parsed.projects ?? {};
  if (!isObject(projects) || !Object.values(projects).every((v) => typeof v === "string")) {
    throw new AxiError(`config projects must map repo names to names`, "CONFIG_ERROR", [
      `Fix projects in ${path}, e.g. { "my-repo": "CLIENT-PROJECT" }`,
    ]);
  }
  const settings = { ...DEFAULTS, ...parsed, projects: { ...projects } };
  for (const key of ["idleGapMinutes", "roundMinutes"] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) {
      throw new AxiError(`config ${key} must be a positive number`, "CONFIG_ERROR", [
        `Fix ${key} in ${path}`,
      ]);
    }
  }
  return settings;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
