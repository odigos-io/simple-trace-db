"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const trace_service_1 = require("./proto/collector/trace/v1/trace_service");
const simple_span_1 = require("./simple-span");
const store_1 = require("./proto/store");
const app = (0, express_1.default)();
const port = 4318;
app.post("/v1/traces", express_1.default.raw({ type: "application/x-protobuf" }), (req, res) => {
    const traceServiceRequest = trace_service_1.ExportTraceServiceRequest.decode(req.body);
    const simpleSpans = (0, simple_span_1.traceServiceRequestToSimpleSpans)(traceServiceRequest);
    store_1.allSpans.push(...simpleSpans);
    simpleSpans.forEach((simpleSpan) => {
        store_1.spansPerTrace[simpleSpan.traceId] = store_1.spansPerTrace[simpleSpan.traceId] || [];
        store_1.spansPerTrace[simpleSpan.traceId].push(simpleSpan);
    });
    console.log('stored spans:', store_1.allSpans.length);
    const traceServiceResponse = trace_service_1.ExportTraceServiceResponse.encode({ partialSuccess: undefined }).finish();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.send(traceServiceResponse);
});
app.get("/v1/spans", (req, res) => {
    const jmespathExpression = req.query.jmespath;
    if (jmespathExpression) {
        const jmespath = require('jmespath');
        const filteredSpans = store_1.allSpans.filter((span) => jmespath.search(span, jmespathExpression));
        console.log('executed jmespath query:', jmespathExpression, 'found:', filteredSpans.length);
        return res.json(filteredSpans);
    }
    res.json(store_1.allSpans);
});
app.get("/v1/traces", (req, res) => {
    const jmespathExpression = req.query.jmespath;
    if (jmespathExpression) {
        const jmespath = require('jmespath');
        const traces = Object.fromEntries(Object.entries(store_1.spansPerTrace).filter(([traceId, spans]) => {
            return jmespath.search(spans, jmespathExpression);
        }));
        console.log('executed jmespath query:', jmespathExpression, 'found:', Object.keys(traces).length);
        return res.json(traces);
    }
    res.json(store_1.spansPerTrace);
});
app.listen(port, () => {
    console.log(`Listening for incoming requests on port ${port}`);
});
