import { ExportLogsServiceRequest } from "./proto/collector/logs/v1/logs_service";
import { SeverityNumber } from "./proto/logs/v1/logs";
import {
  SimpleAnyValue,
  nanosToFullISOString,
  optionalIdToHexString,
  otlpAnyValueToSimpleValue,
  otlpAttributesToMap,
} from "./simple-span";

export enum LogSeverity {
  SEVERITY_UNSPECIFIED = "unspecified",
  SEVERITY_TRACE = "trace",
  SEVERITY_DEBUG = "debug",
  SEVERITY_INFO = "info",
  SEVERITY_WARN = "warn",
  SEVERITY_ERROR = "error",
  SEVERITY_FATAL = "fatal",
}

/**
 * A simple log record, meant to be consumed by human beings.
 * Follows the same conventions as SimpleSpan: flat (no resource->scope->record hierarchy),
 * hex ids, ISO timestamps, attributes as maps.
 *
 * The governing rule for this format is that it omits rather than guesses. Every field below that
 * can be unknown is either absent or carries an explicit "unknown" member. Nothing is defaulted to
 * a value that could be mistaken for real data, because for log capture the records in this
 * database are frequently the only evidence that capture worked at all — a fabricated value here
 * is indistinguishable from a real one.
 */
export interface SimpleLog {
  // the trace this log was emitted during, as a 32 character hex string.
  // absent when the log was not emitted inside an active trace, which is the common case: the
  // ordinary log collection path (scraping container stdout) carries no trace context at all.
  // never present-but-zero — see optionalIdToHexString.
  traceId?: string;

  // the span that was active when this log was emitted, as a 16 character hex string.
  // absent under the same conditions as traceId. a log can carry a traceId without a spanId.
  spanId?: string;

  // the time the log record was created, as reported by the source, in ISO format with nanosecond
  // precision. absent when the source did not report one, which is common: the collector's file
  // scraping only sets it if a timestamp parser is configured.
  // deliberately never falls back to observedTimestamp. the gap between the two is the only thing
  // that distinguishes "the application logged late" from "the collector observed it late", and a
  // silent fallback would make the two indistinguishable while looking correct.
  timestamp?: string;

  // the time the log record was observed by the collection pipeline, in ISO format with nanosecond
  // precision. generally always present, and is the field to reach for when you need "when did
  // this happen" and do not care whose clock answered.
  observedTimestamp?: string;

  // the severity of this log record, normalized to a lowercase name.
  // always present; "unspecified" when the source reported no severity, which is the common case
  // for logs scraped from container stdout where nothing parses a level out of the line.
  // prefer this over severityText when filtering: severityText is whatever the source happened to
  // write, and the same level is spelled differently by every logging library ("SEVERE" from java
  // util logging, "ERROR" from logback and slog, "Error" from .NET), so filtering on it means
  // enumerating spellings. this field is the OTLP severity number collapsed to its range name.
  severity: LogSeverity;

  // the raw OTLP severity number, 1-24. absent when the source reported no severity.
  // kept alongside `severity` because the ranges carry sub-levels that the name collapses:
  // ERROR and ERROR4 are both "error" here but are 17 and 20 respectively.
  severityNumber?: number;

  // the severity as the source spelled it, unmodified. absent when the source reported none.
  // useful when a test fails and you need to see what the application actually wrote.
  severityText?: string;

  // the log body as a string, always present, empty string when the record carried no body.
  // this is the field to match text against: JMESPath's contains() raises on non-strings, so a
  // query against the type-preserving `body` below has to guard the type first.
  // an empty string here is meaningful — it is a record that arrived carrying no body, which is a
  // real shape (log capture reads the payload of write() but not of writev()), and is distinct
  // from the record not arriving at all.
  bodyText: string;

  // the log body with its original type preserved, for structured bodies where the shape matters
  // and you want to match a field rather than a substring. absent when the record carried no body.
  body?: SimpleAnyValue;

  // the service that emitted this log, from the "service.name" resource attribute.
  // optional, unlike on SimpleSpan: logs reach this database from collection paths that do not
  // always resolve a service name, and claiming one that was not reported would be a guess.
  serviceName?: string;

  // resource attributes for this log as a key-value map.
  resourceAttributes: { [key: string]: SimpleAnyValue };

  // the name and version of the instrumentation scope that emitted this record.
  // optional, unlike on SimpleSpan: OTLP explicitly permits an empty scope for logs, and log
  // collection paths that scrape output rather than instrument a library have no scope to report.
  scopeName?: string;
  scopeVersion?: string;

  // attributes attached to this individual log record, as a key-value map.
  // named to mirror SimpleSpan's spanAttributes, so that the resource/record split reads the same
  // way across both signals.
  logAttributes: { [key: string]: SimpleAnyValue };
}

// maps an OTLP severity number to its range name.
// OTLP defines severity as 24 numbers in six ranges of four, where the ranges are the meaningful
// unit and the offset within a range is a sub-level. anything outside 1-24, including the
// explicit UNSPECIFIED zero, is reported as unspecified rather than guessed into a range.
const otlpSeverityNumberToSeverity = (
  severityNumber?: SeverityNumber
): LogSeverity => {
  if (severityNumber == null) {
    return LogSeverity.SEVERITY_UNSPECIFIED;
  }
  if (severityNumber >= 21 && severityNumber <= 24) {
    return LogSeverity.SEVERITY_FATAL;
  }
  if (severityNumber >= 17 && severityNumber <= 20) {
    return LogSeverity.SEVERITY_ERROR;
  }
  if (severityNumber >= 13 && severityNumber <= 16) {
    return LogSeverity.SEVERITY_WARN;
  }
  if (severityNumber >= 9 && severityNumber <= 12) {
    return LogSeverity.SEVERITY_INFO;
  }
  if (severityNumber >= 5 && severityNumber <= 8) {
    return LogSeverity.SEVERITY_DEBUG;
  }
  if (severityNumber >= 1 && severityNumber <= 4) {
    return LogSeverity.SEVERITY_TRACE;
  }
  return LogSeverity.SEVERITY_UNSPECIFIED;
};

// renders a body value as a string for bodyText.
// bytes are decoded as UTF-8 rather than rendered as a byte map, because a body arriving as bytes
// is almost always a log line that was never marked as text, and {"0":72,"1":105} is not something
// anyone can write an assertion against.
const simpleValueToBodyText = (value: SimpleAnyValue): string => {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

// OTLP encodes an unset timestamp as zero rather than omitting the field. formatting that zero
// produces a valid looking "1970-01-01T00:00:00.000000000Z", which would silently pass a
// "did this log happen during its span" check against a completely absent timestamp.
const optionalNanosToFullISOString = (nanos?: bigint): string | undefined => {
  if (nanos == null || nanos === 0n) {
    return undefined;
  }
  return nanosToFullISOString(nanos);
};

export const logsServiceRequestToSimpleLogs = (
  logsServiceRequest: ExportLogsServiceRequest
): SimpleLog[] => {
  const logs: SimpleLog[] = [];
  for (const resourceLogs of logsServiceRequest.resourceLogs) {
    const resourceAttributes = otlpAttributesToMap(
      resourceLogs.resource?.attributes
    );
    for (const scopeLogs of resourceLogs.scopeLogs) {
      for (const logRecord of scopeLogs.logRecords) {
        const body =
          logRecord.body != null
            ? otlpAnyValueToSimpleValue(logRecord.body)
            : undefined;
        const severityNumber = logRecord.severityNumber || undefined;

        const simpleLog: SimpleLog = {
          traceId: optionalIdToHexString(logRecord.traceId, 16),
          spanId: optionalIdToHexString(logRecord.spanId, 8),
          timestamp: optionalNanosToFullISOString(logRecord.timeUnixNano),
          observedTimestamp: optionalNanosToFullISOString(
            logRecord.observedTimeUnixNano
          ),
          severity: otlpSeverityNumberToSeverity(severityNumber),
          severityNumber,
          severityText: logRecord.severityText || undefined,
          bodyText: simpleValueToBodyText(body),
          body,
          serviceName: resourceAttributes["service.name"] as string | undefined,
          resourceAttributes,
          scopeName: scopeLogs.scope?.name || undefined,
          scopeVersion: scopeLogs.scope?.version || undefined,
          logAttributes: otlpAttributesToMap(logRecord.attributes),
        };
        logs.push(simpleLog);
      }
    }
  }
  return logs;
};
