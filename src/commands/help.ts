import { REPORT_HELP } from "./report.js";
import { BLOCKS_HELP } from "./blocks.js";
import { NOTE_HELP } from "./note.js";

// Agent-facing usage lives here, not in the skill, so it can't drift from what the CLI does.
const COMMANDS: Record<string, string> = {
  "(none)": "Show today's tracked time, the running block, and blocks without a note",
  'note "<what>"':
    "Describe the work in the current block (agents: run at task start, on direction change, and at the end)",
  "blocks [--day <day>]": "List a day's blocks with ids, times, notes and refs",
  "report [--week|--last-week|--day|--from --to] [--by] [--format]":
    "Rounded hours per day and project, as TOON or pasteable CSV",
};

const NOTES = [
  "Working time is recorded automatically by Claude Code hooks; there is no start/stop timer to manage",
  "Exit codes: 0 success, 1 operational failure, 2 invalid usage",
  "Run `hours-axi <command> --help` for a command's flags and notes",
];

const EXAMPLES = ["hours-axi", 'hours-axi note "Fix login redirect loop" --ref ABC-123'];

export function topLevelHelp(): string {
  return [
    "usage: hours-axi [command] [flags]",
    `commands[${Object.keys(COMMANDS).length}]:`,
    ...Object.entries(COMMANDS).map(([command, summary]) => `  ${command}: ${summary}`),
    `notes[${NOTES.length}]:`,
    ...NOTES.map((note) => `  ${note}`),
    `examples[${EXAMPLES.length}]:`,
    ...EXAMPLES.map((example) => `  ${example}`),
    "",
  ].join("\n");
}

const COMMAND_HELP: Record<string, string> = {
  report: REPORT_HELP,
  blocks: BLOCKS_HELP,
  note: NOTE_HELP,
};

export function commandHelp(command: string): string | undefined {
  return COMMAND_HELP[command];
}
