# What is recorded

hours-axi records the minimum it needs to work out time per project. Everything stays on your machine.

## Stored for each activity moment

- the time
- the agent session id
- the kind of moment (session start or end, prompt sent, tool finished, turn finished)
- the working directory, the repo name worked out from it, and the current git branch

## Stored when you or the agent act

- notes, with an optional ticket id
- corrections: edits, drops, and time you added by hand

## Never stored

Prompts, the agent's replies, tool input or output, file contents, and transcripts are never read into the record. They do pass through the hook as the host delivers them, but they are discarded.

## Where it lives

The record lives in `~/.local/share/hours-axi/` (or `$XDG_DATA_HOME/hours-axi/`). It is outside every repo, so it never shows up in a project's git status. Nothing is sent anywhere. Reports only show project names, hours, notes and ticket ids.

Directory paths and branch names can say more than you might expect, like a client's name. They stay in the local record and never appear in reports.

## Turning it off

`hours-axi setup claude --remove` stops recording. Deleting the data folder removes everything that was recorded.
