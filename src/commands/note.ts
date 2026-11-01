import type { AxiCliCommand } from "axi-sdk-js";
import { parseCommand } from "../args.js";
import { eventsPath } from "../config.js";
import { notFound, validation } from "../errors.js";
import { appendEvent, type NoteEvent } from "../events.js";
import { detectProject } from "../project.js";
import { findBlock, loadState, type Deps } from "../state.js";

export const NOTE_HELP = [
  'usage: hours-axi note "<what>" [--ref <ticket>] [--block <id>] [--project <name>]',
  "flags:",
  "  --ref <ticket>: Ticket or issue id shown next to the note in reports, e.g. ABC-123",
  "  --block <id>: Label a specific block (ids from `hours-axi` or `hours-axi blocks`) instead of the current one",
  "  --project <name>: Repo name the note belongs to; defaults to the current directory's repo",
  "notes:",
  "  Run it when you start a task or its direction changes, and once at the end with a one-line summary",
  "  Notes end up in the user's hour report: describe the outcome in plain words, no secrets or file contents",
  "  Without --block the note joins the current block of this project; repeating the same text is a no-op",
  "",
].join("\n");

export function noteCommand(deps: Deps): AxiCliCommand<undefined> {
  return (args) => {
    const { positionals, flags } = parseCommand("note", args, {
      ref: { type: "string" },
      block: { type: "string" },
      project: { type: "string" },
    });
    const text = positionals.join(" ").trim();
    if (!text) validation("note text is required", 'Run `hours-axi note "<what>"`');

    const blockId = flags.block as string | undefined;
    if (blockId && !findBlock(loadState(deps), blockId)) {
      notFound(`no block ${blockId}`, "Run `hours-axi blocks` to list block ids");
    }
    const project = (flags.project as string | undefined) ?? detectProject(deps.cwd).project;
    const event: NoteEvent = {
      v: 1,
      type: "note",
      ts: new Date(deps.now()).toISOString(),
      project,
      text,
      ...(flags.ref ? { ref: flags.ref as string } : {}),
      ...(blockId ? { block: blockId } : {}),
    };
    appendEvent(eventsPath(deps.env), event);

    const state = loadState(deps);
    const block = state.blocks.find(
      (b) => b.notes.includes(text) && b.project === (state.settings.projects[project] ?? project),
    );
    return {
      noted: text,
      project,
      // Notes are matched to blocks on read, so a note made before its block has two pings still lands.
      block: block?.id ?? "pending: joins the next block of this project that has activity",
    };
  };
}
