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

