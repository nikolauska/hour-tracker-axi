import { AxiError } from "axi-sdk-js";

export function validation(message: string, suggestion = "Run `hours-axi --help`"): never {
  throw new AxiError(message, "VALIDATION_ERROR", [suggestion]);
}

export function notFound(message: string, suggestion: string): never {
  throw new AxiError(message, "NOT_FOUND", [suggestion]);
}
