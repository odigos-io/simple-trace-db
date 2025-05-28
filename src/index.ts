import express from "express";
import { ExportTraceServiceRequest, ExportTraceServiceResponse } from "./proto/collector/trace/v1/trace_service";
import { traceServiceRequestToSimpleSpans } from "./simple-span";
import { allSpans, spansPerTrace } from "./proto/store";
import { env } from "process";
import { executeQuery } from "./queries";
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

app.listen(port, '0.0.0.0', () => {
  console.log(`Listening for incoming requests on port ${port}`);
});
