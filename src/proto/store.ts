import { SimpleSpan } from "../simple-span";
import { SimpleLog } from "../simple-log";

export const allSpans: SimpleSpan[] = [];
export const spansPerTrace: Record<string, SimpleSpan[]> = {};

// logs are stored flat and are never indexed by trace id.
// keeping them out of spansPerTrace guarantees that ingesting logs can never add a key to the
// traces map, so a log arriving for a trace with no spans cannot change the result of /v1/traces.
export const allLogs: SimpleLog[] = [];
