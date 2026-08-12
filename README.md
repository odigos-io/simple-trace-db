# simple-trace-db

Trace Database that optimizes simplicity and is designed for writing tests.

- No Indexing
- No Sharding
- No Replication
- No Retention
- No Configuration

How simplicity is achieved:

- In-Memory - no need to install a database, volume, or network
- Brute-force - always run queries on all data.

## API

### Store Spans

Add spans with OTLP/HTTP by `Post`ing to `/v1/traces` endpoint.

### Query Spans

Query all spans in the database and return result as JSON:

```sh
GET /v1/spans
```

To filter the spans based on it's properties, send a `JMESPath` query as a query parameter (url-encoded):

```sh
GET /v1/spans?jsmepath=name%3D%3D%27GET%27
```

(which is url-encoded for `name=='GET'`).

This query will return only spans with `name` property equal to `GET`.

### Query Traces

Get a map of traces, where key is trace ID and value is a list of spans:

```sh
GET /v1/traces
```

Get only traces where the spans array matches some condition:

```sh
GET /v1/traces?jsmepath=length%28%5B%3FserviceName%3D%3D%27inventory%27%5D%29%20%3E%20%600%60
```

(or url-decoded: "length([?serviceName=='inventory']) > `0`")

e.g. return all traces that includes a span with `serviceName` set to `inventory`.

### Store Logs

Add log records with OTLP/HTTP by `Post`ing to `/v1/logs` endpoint.

### Query Logs

Get all log records as a JSON array:

```sh
GET /v1/logs
```

To filter, send a `JMESPath` query as a query parameter (url-encoded):

```sh
GET /v1/logs?jmespath=%5B%3Fseverity%20%3D%3D%20%27error%27%5D
```

(or url-decoded: "[?severity == 'error']")

**The query is evaluated against the whole array, not once per record.** This differs from
`/v1/spans`, which filters per record, and the difference is deliberate:

| expression | `/v1/logs` | `/v1/spans` |
| --- | --- | --- |
| `[?severity == 'error']` | selects matching records | selects nothing |
| `severity == 'error'` | returns `false` | selects matching records |

Both endpoints reject one of the two shapes, so the question is which mistake is quieter. A filter
projection is what every existing query in the Odigos e2e suite looks like, so it is the shape most
people write first. Evaluated per record it silently returns `[]`, and a test asserting a count of
zero would pass whether or not anything works. Evaluated against the array the wrong shape returns
a scalar instead, which fails loudly in whatever is counting the result.

When a query returns a non-array the server logs the value rather than a count
(`found: false`), since that is the signal that the expression shape is wrong rather than that
nothing matched.

### Clear

Remove all stored spans and logs:

```sh
GET /v1/clear
```

This is a `GET` rather than a `DELETE` or `POST` so that it can be reached through the Kubernetes
API server proxy, which only forwards `GET`.

## Simple Span

"Simple Span" is a format invented and used in this DB, which optimizes simplicity and readability for human beings who need to understand it.

simple-trace-db will transform the OTLP spans it receives into "Simple Span" format before storing them in memory. When writing a query to the memory-db, the query will run against those "Simple Spans" objects, and those will be returned in the response.

- Each span looks the same and contains both resource and scope (unlike OTLP where there is an hierarchy resources->scopes->spans which is more compact but harder to read and query).
- Trace and span IDs are written in hex, just as you would see them in most APMs (unlike storing them as byte arrays).
- Timestamps are stored as ISO string with nanosecond precision ("2025-03-12T17:05:02.096444502Z") which is straightforward to sort and consume for humans (in oppose to nanos/seconds since epoch).
- All attributes (resource, scope and span) are stored as maps, where key is the attribute name and value is the attribute value (unlike OTLP where attributes are stored as an array of key-value pairs). This makes the data more compact and easier to read and query.
- "enum" values are stored as strings instead of numerical values. kind can be "internal", "server", "client", "producer", "consumer".
- "span status" is abstracted into a boolean that record of the span reported as error or not. Remove the need to use "SpanStatus" OTLP enum, and is more straightforward to query by.
- some common fields are extracted for easy of use:
  - `serviceName` is extracted from the `service.name` resource attribute as a key for the span.
  - `durationMs` is calculated from the `startTime` and `endTime` span attributes.

This format is not most compact and efficient for storage; it duplicates some data per span, and uses strings instead of ints or enums. Since this DB is designed for tests with very few spans, the simplicity and readability of the data is more important than the efficiency of the storage.

## Simple Log

"Simple Log" is the log equivalent of Simple Span and follows the same conventions: flat rather
than the OTLP resource->scope->record hierarchy, hex ids, ISO timestamps with nanosecond
precision, and attributes as maps.

| field | notes |
| --- | --- |
| `traceId` / `spanId` | hex. Absent when the record carries no trace context. |
| `timestamp` | from `time_unix_nano`. Absent when the source did not report one. |
| `observedTimestamp` | from `observed_time_unix_nano`, when the pipeline saw the record. |
| `severity` | always present. `trace`/`debug`/`info`/`warn`/`error`/`fatal`/`unspecified`. |
| `severityNumber` | the raw OTLP number, 1-24. Absent when the source reported no severity. |
| `severityText` | as the source spelled it. Absent when the source reported none. |
| `bodyText` | always a string, `""` when the record carried no body. |
| `body` | the body with its original type preserved. Absent when there was none. |
| `serviceName` | from the `service.name` resource attribute. Optional, unlike on Simple Span. |
| `resourceAttributes` | map. |
| `scopeName` / `scopeVersion` | optional, unlike on Simple Span - OTLP permits an empty scope for logs. |
| `logAttributes` | map. Named to mirror Simple Span's `spanAttributes`. |

Filter on `severity` rather than `severityText`. The same level is spelled differently by every
logging library - `SEVERE` from java util logging, `ERROR` from logback and slog, `Error` from
.NET - so a query on the raw text has to enumerate spellings. `severityNumber` is kept alongside
because the range name collapses OTLP's sub-levels: `ERROR` and `ERROR4` are both `error` but are
17 and 20.

Match text against `bodyText`, not `body`. JMESPath's `contains()` raises on non-strings, so a
query against the type-preserving `body` needs a `type(body) == 'string'` guard first. Use `body`
for structured matching, where the shape is the point.

### This format omits rather than guesses

Every field above that can be unknown is either absent or carries an explicit unknown member.
Nothing is defaulted to a value that could be mistaken for real data. Two rules follow from that,
and they are worth stating because they look inconsistent otherwise:

**Enums carry an explicit unknown member; scalars and ids are omitted.** `severity` is
`"unspecified"` for the same reason `kind` is - there is a natural name for "not reported", and an
explicit one lets a reader tell "the source had no severity" apart from "the DB failed to populate
it". There is no non-arbitrary sentinel for a hex id or an instant, so those are simply absent.

**Anything that could be mistaken for a real value is normalised away.** OTLP marks "no id" three
interchangeable ways - field absent, present but empty, or present and all zero bytes - and senders
differ on which they use. All three become absent, because an all-zero id hex-encodes to a
plausible looking `"000...0"` that compares equal across every unrelated record. The same applies
to timestamps: OTLP encodes an unset time as zero, which would format as a valid looking
`1970-01-01T00:00:00.000000000Z`.

This matters more for logs than for spans. A log record is often the only evidence that log
capture worked at all - there is no status or condition to check separately - so a fabricated value
here is indistinguishable from a real one.
