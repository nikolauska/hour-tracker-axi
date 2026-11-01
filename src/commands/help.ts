// Agent-facing usage lives here, not in the skill, so it can't drift from what the CLI does.
const COMMANDS: Record<string, string> = {
  "(none)": "Show today's tracked time, the running block, and blocks without a note",
};

const NOTES = [
  "Working time is recorded automatically by Claude Code hooks; there is no start/stop timer to manage",
  "Exit codes: 0 success, 1 operational failure, 2 invalid usage",
  "Run `hours-axi <command> --help` for a command's flags and notes",
];

const EXAMPLES = ["hours-axi"];

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

const COMMAND_HELP: Record<string, string> = {};

export function commandHelp(command: string): string | undefined {
  return COMMAND_HELP[command];
}
