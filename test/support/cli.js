import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../dist/cli.js";
import { appendEvent } from "../../dist/events.js";

// A throwaway data/config/home per test so nothing touches real user state.
export function sandbox(nowIso = "2026-11-02T12:00:00.000Z") {
  const root = mkdtempSync(join(tmpdir(), "hours-cli-"));
  mkdirSync(join(root, "alpha", ".git"), { recursive: true });
  const env = {
    HOME: join(root, "home"),
    HOURS_AXI_DATA_DIR: join(root, "data"),
    HOURS_AXI_CONFIG_DIR: join(root, "config"),
    CLAUDE_CONFIG_DIR: join(root, "claude"),
  };
  let now = Date.parse(nowIso);
  return {
    root,
    env,
    eventsFile: join(env.HOURS_AXI_DATA_DIR, "events.jsonl"),
    setNow: (iso) => (now = Date.parse(iso)),
    append: (event) => appendEvent(join(env.HOURS_AXI_DATA_DIR, "events.jsonl"), event),
    ping: (session, iso, project = "alpha") =>
      appendEvent(join(env.HOURS_AXI_DATA_DIR, "events.jsonl"), {
        v: 1,
        type: "activity",
        ts: iso,
        session,
        event: "PostToolUse",
        cwd: join(root, project),
        project,
      }),
    async cli(...argv) {
      let output = "";
      process.exitCode = undefined;
      await run(argv, {
        env,
        now: () => now,
        cwd: join(root, "alpha"),
        version: "0.0.0-test",
        stdout: { write: (chunk) => (output += chunk) },
      });
      const exitCode = process.exitCode ?? 0;
      process.exitCode = undefined;
      return { output, exitCode };
    },
  };
}
