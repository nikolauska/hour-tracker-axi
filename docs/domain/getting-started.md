# Getting started

hours-axi records how long a coding agent works on each project, so you can fill in your hour report from real data instead of memory. Timing comes from the agent host automatically. The agent's only job is to say what the work was.

## Install

Install the package globally with npm:

```sh
npm install -g @nikolauska/hour-tracker-axi
```

This gives you the `hours-axi` command.

## Turn on automatic tracking

Tracking is off until you turn it on. Run this once:

```sh
hours-axi setup claude
```

This adds hooks to your Claude Code user settings. From then on, every new Claude Code session records its activity. Sessions that were already running need a restart. Running the command again changes nothing. The hooks run `hours-axi` by name, so setup warns if it can't find `hours-axi` on your `PATH`. A hook that can't run fails silently, and the day just looks empty. `hours-axi setup claude --remove` takes the hooks out again and leaves every other setting alone.

Only Claude Code is supported for automatic timing. In other agents you can still write notes and add time by hand.

## Day to day

- **The agent describes the work.** The agent runs `hours-axi note "<what>"` when a task starts, when it changes direction, and once at the end. A ticket id can go with `--ref`. The agent never starts or stops a timer.
- **You check the day.** `hours-axi` shows today's total, the block that's still running, and any block without a note yet. It also shows whether the hooks are installed and when activity was last recorded. When an agent runs it inside a Claude Code session that should be recording but has nothing recent, it warns.
- **You fix what's wrong.** `hours-axi blocks` lists a day's blocks with their ids. `hours-axi edit <id>` changes a block's times, project, note or ticket id, and `hours-axi drop <id>` leaves a block out of reports. `hours-axi blocks --all` still shows dropped blocks, and `hours-axi restore <id>` brings one back.
- **You add what no agent saw.** For meetings, calls and reviews, use `hours-axi add --from 13:00 --to 14:00 --note "Planning"`. `--ref` adds a ticket id, and full timestamps like `2026-11-03T00:30:00+02:00` let an entry run past midnight.
- **You report.** `hours-axi report --week` shows this week's rounded hours per day and project. `--month` does the same for this month, `--month 2026-10` for a given month, and `--last-month` for the previous one. `--project <name>` limits a report to one project, and `--by project` gives one total per project instead of per day. `--format csv` gives the same rows ready to paste into a spreadsheet or reporting tool.

Run `hours-axi --help` or `hours-axi <command> --help` for every flag.

## Settings

Settings are optional and live in `~/.config/hours-axi/config.json` (or `$XDG_CONFIG_HOME/hours-axi/config.json`):

```json
{
  "idleGapMinutes": 15,
  "roundMinutes": 15,
  "roundMode": "nearest",
  "branchRefs": true,
  "projects": { "my-repo": "CLIENT-PROJECT", "~/work/api": "CLIENT-API" }
}
```

- `idleGapMinutes`: the longest pause that still counts as continuous work. See [How hours are counted](how-hours-are-counted.md).
- `roundMinutes`: the rounding step used in reports.
- `roundMode`: `nearest` (default) rounds each day + project to the nearest step, `up` always rounds up to the next one, for billing rules that work that way.
- `branchRefs`: when a block has no ticket id from a note, take one from its git branch name (like `ABC-123` in `feature/ABC-123-login`). Set it to `false` if your branch names contain words that look like ticket ids but aren't.
- `projects`: renames a repo in reports, for when your reporting tool expects a client or project code. A key is either a repo name or a path starting with `/` or `~/`. A path matches work in that folder and everything under it, so two repos with the same folder name (like `~/work/api` and `~/personal/api`) can get different names. The longest matching path wins, then a repo-name key. A path only matches the folder the agent actually ran in, so a git worktree kept somewhere else needs its own entry. `--project` on `note`, `edit` and `add` accepts the repo name or the report name.

All of these apply to past weeks too, because hours are recalculated from the raw record every time.
