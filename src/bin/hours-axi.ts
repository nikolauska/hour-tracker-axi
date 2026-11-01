#!/usr/bin/env node

// The hook path runs on every agent tool call, so it skips loading the CLI framework.
if (process.argv[2] === "hook") {
  const { runHook } = await import("../hook.js");
  await runHook();
} else {
  const { main } = await import("../cli.js");
  await main();
}
