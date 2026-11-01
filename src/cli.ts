import { readFile } from "node:fs/promises";
import { runAxiCli, type AxiCliCommand } from "axi-sdk-js";
import { home } from "./commands/home.js";
import { setupCommand } from "./commands/setup.js";
import { addCommand } from "./commands/add.js";
import { dropCommand, editCommand } from "./commands/edit.js";
import { reportCommand } from "./commands/report.js";
import { blocksCommand } from "./commands/blocks.js";
import { commandHelp, topLevelHelp } from "./commands/help.js";
import { noteCommand } from "./commands/note.js";
import type { Deps } from "./state.js";

interface RunOptions extends Partial<Deps> {
  stdout?: { write(chunk: string): unknown };
  version?: string;
}

export async function main(): Promise<void> {
  await run(process.argv.slice(2));
}

export async function run(argv: string[], options: RunOptions = {}): Promise<void> {
  const deps: Deps = {
    env: options.env ?? process.env,
    now: options.now ?? Date.now,
    cwd: options.cwd ?? process.cwd(),
  };
  const commands: Record<string, AxiCliCommand<undefined>> = {
    setup: setupCommand(deps),
    add: addCommand(deps),
    edit: editCommand(deps),
    drop: dropCommand(deps),
    report: reportCommand(deps),
    blocks: blocksCommand(deps),
    note: noteCommand(deps),
  };

  await runAxiCli({
    argv,
    commands,
    description:
      "Agent working-hours tracker: hooks record time, agents add notes, reports total it.",
    getCommandHelp: commandHelp,
    home: () => home(deps),
    packageName: "@nikolauska/hour-tracker-axi",
    stdout: options.stdout,
    topLevelHelp: topLevelHelp(),
    version: options.version ?? (await packageVersion()),
  });
}

async function packageVersion(): Promise<string> {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return String((JSON.parse(raw) as Record<string, unknown>).version ?? "dev");
}
