# How hours are counted

hours-axi never stores "hours". It stores moments when an agent was active, and it works out the hours from those every time you look. Change a rule and every past week is recalculated with it.

## Activity and blocks

Each time the agent host reports activity, one moment gets recorded: a session starting or ending, a prompt being sent, a tool finishing, the agent finishing its turn. During a long agent turn, the tool calls act as a heartbeat.

A **block** is one stretch of continuous activity within one agent session. A block runs from its first moment to its last.

- **Idle gap.** If two moments in the same session are at most the idle gap apart (15 minutes by default), the time between them counts as work. A longer pause ends the block, and the next activity starts a new one. Lunch, meetings and evenings therefore don't count, even if the session stays open.
- **A lone moment is not work.** A single moment with nothing within the idle gap has no length and produces no block.
- **One project per block.** A block belongs to the repo it ran in. If a session moved between repos, the block goes to the repo where most of its activity happened. Git worktrees count as their main repo.
- **Stable ids.** Each block has a short id (like `b-4caa1e`) that stays the same between views, so it can be referenced for fixes and notes.

Any activity counts, including long agent runs while you are away from the keyboard. That makes the number simple to understand, but it can be higher than the time you personally spent. Review the day before reporting it.

## Parallel sessions

Running several agents at once does not multiply your hours. Within a day, every minute counts at most once:

- Two overlapping blocks in the **same project** count their overlap once.
- Overlapping blocks in **different projects** split the shared minutes evenly. One hour with two projects active gives each project 30 minutes.

A block's "time" in `hours-axi` and `hours-axi blocks` is its share after this split, which can be less than its start-to-end length.

## Days and midnight

Days are your local calendar days. A block that runs past midnight is split there, and each day gets its own part. Report weeks run Monday to Sunday, and report months are calendar months.

## Rounding

Rounding happens only in reports, never in the stored record. Each day + project total is rounded once, to the nearest step (15 minutes by default). Rounding each block separately would make a day with many short blocks look longer than it was.

A day + project with very little time can round to 0. That row still shows up in the report, so nothing disappears without you seeing it. The report also shows the exact unrounded total next to the rounded one.

## Notes

Notes are what turn hours into a report line. When the agent writes a note, it joins the block of the same project that is running at that moment, or one that ended or starts within the idle gap. A note written just before any activity still lands if activity follows within the idle gap. A note can also name a specific block. The same note text appears only once per block. In reports, the notes and ticket ids of every block in a day + project are listed together.

## Corrections

Corrections are recorded on top of the original activity. They never rewrite it.

- **Edit** changes a block's start, end, project, or notes. An edited note replaces the notes the block had up to that moment. Notes the agent writes afterwards are added to it as usual.
- **Drop** leaves a block out of every report. Dropping a block that's already dropped succeeds and changes nothing.
- **Add** records time no agent saw, like a meeting. Added time overlaps with agent blocks like any other block and is split the same way.

## What is not counted

Only time an agent was active, plus time you add by hand. Work done without an agent (reading, reviewing, thinking, meetings) is invisible until you add it. The report is a strong starting point, not a complete record by itself.
