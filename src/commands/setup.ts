import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AxiError, type AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { validation } from "../errors.js";
import type { Deps, Env } from "../state.js";

export const SETUP_HELP = [
  "usage: hours-axi setup claude [--remove]",
  "flags:",
  "  --remove: Remove the hooks this tool added; other hooks are left untouched",
  "notes:",
  "  Edits Claude Code user settings (settings.json); run only when the user asks",
  "  Adds async hooks for SessionStart, UserPromptSubmit, PostToolUse, Stop and SessionEnd that run `hours-axi hook`",
  "  Hooks store timestamps, session id, directory, repo and branch only; never prompts, tool input or transcripts",
  "  Safe to run again: an existing install is reported as already installed",
  "",
].join("\n");

// The events that together show when a session is doing work; PostToolUse is the
// heartbeat during long agent turns, the others mark turn and session edges.
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "Stop",
  "SessionEnd",
];
const HOOK_COMMAND = "hours-axi hook";

interface Handler {
  type?: string;
  command?: string;
  [key: string]: unknown;
}
interface Group {
  matcher?: string;
  hooks?: Handler[];
  [key: string]: unknown;
}
type Settings = { hooks?: Record<string, Group[]>; [key: string]: unknown };

export function setupCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("setup", args, { remove: { type: "boolean" } });
    if (positionals.length !== 1 || positionals[0] !== "claude") {
      validation("setup requires `claude`", "Run `hours-axi setup claude`");
    }
    const path = settingsPath(deps.env);
    const before = readSettings(path);
    const after = flags.remove ? withoutOurHooks(before) : withOurHooks(before);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) writeSettings(path, after);

    const home = deps.env.HOME || homedir();
    const shown = path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
    if (flags.remove) return { setup: changed ? "removed" : "not installed", settings: shown };
    return {
      setup: changed ? "installed" : "already installed",
      settings: shown,
      events: HOOK_EVENTS,
      help: [
        "New Claude Code sessions record time automatically; restart sessions that are already running",
        "Run `hours-axi` later to see tracked time",
      ],
    };
  };
}

export function settingsPath(env: Env): string {
  return join(env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), ".claude"), "settings.json");
}

function readSettings(path: string): Settings {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new AxiError(`cannot read ${path}`, "SETUP_ERROR", ["Check the file's permissions"]);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Settings;
  } catch {
    // Fall through to the error below.
  }
  // Never rewrite a file we could not parse: that would destroy the user's other settings.
  throw new AxiError(`${path} is not a JSON object; left unchanged`, "SETUP_ERROR", [
    "Fix the JSON, then run `hours-axi setup claude` again",
  ]);
}

function isOurs(handler: Handler): boolean {
  return (
    typeof handler.command === "string" && /(^|[\s/])hours-axi(\.js)? hook\b/.test(handler.command)
  );
}

function withoutOurHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, Group[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }
    const kept = groups
      .map((group) =>
        Array.isArray(group.hooks)
          ? { ...group, hooks: group.hooks.filter((h) => !isOurs(h)) }
          : group,
      )
      .filter((group) => !Array.isArray(group.hooks) || group.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  const { hooks: _removed, ...rest } = settings;
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
}

function withOurHooks(settings: Settings): Settings {
  const hasAll = HOOK_EVENTS.every((event) =>
    settings.hooks?.[event]?.some((group) =>
      group.hooks?.some((h) => isOurs(h) && h.async === true),
    ),
  );
  if (hasAll) return settings;
  // Rebuild from a clean slate so a partial or outdated install is repaired, not duplicated.
  const base = withoutOurHooks(settings);
  const hooks = { ...base.hooks };
  for (const event of HOOK_EVENTS) {
    // async: tracking must never add latency to the agent or be able to block it.
    hooks[event] = [
      ...(hooks[event] ?? []),
      { hooks: [{ type: "command", command: HOOK_COMMAND, async: true, timeout: 10 }] },
    ];
  }
  return { ...base, hooks };
}

function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  // Write-then-rename so a crash mid-write can't leave Claude Code with a truncated settings file.
  const temp = `${path}.hours-axi.tmp`;
  writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temp, path);
}
