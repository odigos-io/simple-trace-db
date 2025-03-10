import express from "express";
import { ExportTraceServiceRequest, ExportTraceServiceResponse } from "./proto/collector/trace/v1/trace_service";
import { traceServiceRequestToSimpleSpans } from "./simple-span";
import { allSpans, spansPerTrace } from "./proto/store";

const app = express();
const port = 4318;

app.post(
  "/v1/traces",
  (express as any).raw({ type: "application/x-protobuf" }),
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
        const jmespath = require('jmespath');
        const traces = Object.fromEntries(Object.entries(spansPerTrace).filter(([traceId, spans]) => {
            return jmespath.search(spans, jmespathExpression)
        }));
        console.log('executed jmespath query:', jmespathExpression, 'found:', Object.keys(traces).length);
        return res.json(traces);
    }
    res.json(spansPerTrace);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Listening for incoming requests on port ${port}`);
});
