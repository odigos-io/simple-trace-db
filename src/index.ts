import express from "express";
import { ExportTraceServiceRequest, ExportTraceServiceResponse } from "./proto/collector/trace/v1/trace_service";
import { ExportLogsServiceRequest, ExportLogsServiceResponse } from "./proto/collector/logs/v1/logs_service";
import { traceServiceRequestToSimpleSpans } from "./simple-span";
import { logsServiceRequestToSimpleLogs } from "./simple-log";
import { allLogs, allSpans, spansPerTrace } from "./proto/store";
import { env } from "process";
import { executeQuery } from "./queries";
import { runJmespathQuery } from "./queries/jmespath";
import { QuerySyntax } from "./queries/types";
import { SpansStructure } from "./spans-structure/types";

const app = express();
const port = Number(env.PORT) || 4318;

app.post(
  "/v1/traces",
  (express as any).raw({ type: "application/x-protobuf", limit: '50mb' }),
  (req: express.Request, res: express.Response) => {
    const traceServiceRequest = ExportTraceServiceRequest.decode(
      (req as any).body
    );
    const simpleSpans = traceServiceRequestToSimpleSpans(traceServiceRequest);
    allSpans.push(...simpleSpans);
    simpleSpans.forEach((simpleSpan) => {
        spansPerTrace[simpleSpan.traceId] = spansPerTrace[simpleSpan.traceId] || [];
        spansPerTrace[simpleSpan.traceId].push(simpleSpan);
    });
    console.log('stored spans:', allSpans.length);
    
    const traceServiceResponse = ExportTraceServiceResponse.encode({partialSuccess: undefined}).finish();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.send(traceServiceResponse);
  }
);

app.post(
  "/v1/logs",
  (express as any).raw({ type: "application/x-protobuf", limit: '50mb' }),
  (req: express.Request, res: express.Response) => {
    const logsServiceRequest = ExportLogsServiceRequest.decode(
      (req as any).body
    );
    const simpleLogs = logsServiceRequestToSimpleLogs(logsServiceRequest);
    // appended one at a time rather than with a spread, which passes every element as a separate
    // argument and overflows the stack on the large batches a busy log pipeline produces.
    for (const simpleLog of simpleLogs) {
      allLogs.push(simpleLog);
    }
    console.log('stored logs:', allLogs.length);

    const logsServiceResponse = ExportLogsServiceResponse.encode({partialSuccess: undefined}).finish();
    res.setHeader('Content-Type', 'application/x-protobuf');
    // wrapped in a Buffer because express falls back to res.json() for a plain Uint8Array,
    // which would answer this protobuf request with the two byte body "{}".
    res.send(Buffer.from(logsServiceResponse));
  }
);

app.get("/v1/spans", (req: express.Request, res: express.Response) => {
    const jmespathExpression = req.query.jmespath as string;
    if(jmespathExpression) {
        const jmespath = require('jmespath');
        const filteredSpans = allSpans.filter((span) => jmespath.search(span, jmespathExpression));
        console.log('executed jmespath query:', jmespathExpression, 'found:', filteredSpans.length);
        return res.json(filteredSpans);
    }
    res.json(allSpans);
});

app.get("/v1/traces", (req: express.Request, res: express.Response) => {

    const jmespathExpression = req.query.jmespath as string;
    if(jmespathExpression) {
        const traces = Object.fromEntries(Object.entries(spansPerTrace).filter(([_, spans]) => {
            return executeQuery(spans, QuerySyntax.JMESPath, SpansStructure.ReverseTree, jmespathExpression);
        }));
        console.log('executed jmespath query:', jmespathExpression, 'found:', Object.keys(traces).length);
        return res.json(traces);
    }

    const jsonpathExpression = req.query.jsonpath as string;
    if(jsonpathExpression) {
        const traces = Object.fromEntries(Object.entries(spansPerTrace).filter(([_, spans]) => {
            return executeQuery(spans, QuerySyntax.JMESPath, SpansStructure.Flat, jmespathExpression).length > 0;
        }));
        console.log('executed jsonpath query:', jsonpathExpression, 'found:', Object.keys(traces).length);
        return res.json(traces);
    }
    res.json(spansPerTrace);
});

// the query is evaluated against the whole array of logs, not once per record, so an expression
// reads the same way as the trace queries do: `[?severity == 'error']`.
//
// this deliberately differs from /v1/spans, which filters per record. the reason is which mistake
// stays silent. every existing query in the odigos e2e suite is a filter projection, so that is
// the shape an author writes first. evaluated per record, `[?...]` is applied to a single object,
// yields null for every one of them, and returns an empty array - which an `expected.count: 0`
// assertion accepts, so a negative control would pass whether or not the pipeline works.
// evaluated against the array, the wrong shape returns a scalar instead, `jq length` fails on it,
// and the test errors out where someone can see it.
app.get("/v1/logs", (req: express.Request, res: express.Response) => {
    const jmespathExpression = req.query.jmespath as string;
    if(jmespathExpression) {
        const filteredLogs = runJmespathQuery(jmespathExpression, allLogs);
        // a non-array result means the expression was not a filter projection. it is logged as the
        // value rather than a count, because pod stdout is the only diagnostic channel in-cluster
        // and "found: false" is what tells the author their query shape is wrong.
        console.log('executed jmespath query:', jmespathExpression, 'found:', Array.isArray(filteredLogs) ? filteredLogs.length : filteredLogs);
        return res.json(filteredLogs);
    }
    res.json(allLogs);
});

// clearing is a GET so it can be reached through the kubernetes api server proxy, which the e2e
// tests use to talk to this service and which only forwards GET.
app.get("/v1/clear", (req: express.Request, res: express.Response) => {
    // the stores are const bindings shared by every module that imported them, so they are emptied
    // in place. reassigning would leave those importers holding the old arrays.
    allSpans.length = 0;
    allLogs.length = 0;
    for (const traceId of Object.keys(spansPerTrace)) {
        delete spansPerTrace[traceId];
    }
    console.log('cleared all spans and logs');
    res.json({ cleared: true });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Listening for incoming requests on port ${port}`);
});
