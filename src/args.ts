import { parseArgs } from "node:util";
import { validation } from "./errors.js";

export type FlagSpec = Record<string, { type: "string" | "boolean" }>;

// Wraps node:util parseArgs so unknown or malformed flags become a usage error (exit 2)
// with a pointer to the command's help, instead of a raw stack trace.
export function parseCommand(
  command: string,
  args: string[],
  options: FlagSpec,
): { positionals: string[]; flags: Record<string, string | boolean | undefined> } {
  try {
    const { positionals, values } = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    return { positionals, flags: values as Record<string, string | boolean | undefined> };
  } catch (error) {
    validation((error as Error).message, `Run \`hours-axi ${command} --help\``);
  }
}
