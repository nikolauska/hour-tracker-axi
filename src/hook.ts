import { eventsPath } from "./config.js";
import { appendEvent, type ActivityEvent } from "./events.js";
import { detectProject } from "./project.js";

type Env = Record<string, string | undefined>;

// Only these fields are read from the hook payload; prompts, tool input and transcripts are
// deliberately ignored so the log never holds anything but timing metadata.
interface HookPayload {
  session_id?: unknown;
  cwd?: unknown;
  hook_event_name?: unknown;
}

export function recordHook(input: string, env: Env = process.env, now = Date.now()): boolean {
  let payload: HookPayload;
  try {
    payload = JSON.parse(input) as HookPayload;
  } catch {
    return false;
  }
  if (typeof payload.session_id !== "string" || typeof payload.cwd !== "string") return false;
  const { project, branch } = detectProject(payload.cwd);
  const event: ActivityEvent = {
    v: 1,
    type: "activity",
    ts: new Date(now).toISOString(),
    session: payload.session_id,
    event: typeof payload.hook_event_name === "string" ? payload.hook_event_name : "unknown",
    cwd: payload.cwd,
    project,
    ...(branch ? { branch } : {}),
  };
  appendEvent(eventsPath(env), event);
  return true;
}

// Never print and always exit 0: stdout of some hook events is injected into the agent's
// context, and a non-zero exit shows an error in the agent session. Tracking must stay invisible.
export async function runHook(): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    recordHook(Buffer.concat(chunks).toString("utf8"));
  } catch {
    // Swallowed on purpose; see above.
  }
  process.exitCode = 0;
}
