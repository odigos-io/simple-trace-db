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
