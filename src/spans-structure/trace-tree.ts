import { SimpleSpan } from "../simple-span";

export interface SimpleSpanTreeNode {
  // the "Simple Span" object that this tree node represents
  span: SimpleSpan;

  // all the spans in the trace that has current span as their parent span
  children: SimpleSpanTreeNode[];
}

const recursiveSpansToTree = (childrenMap: Map<string | undefined, SimpleSpan[]>, currentSpan: SimpleSpan): SimpleSpanTreeNode => {
    const children = childrenMap.get(currentSpan.spanId) || [];
    return {
        span: currentSpan,
        children: children.map((child) => recursiveSpansToTree(childrenMap, child))
    };
}

export const spansToTraceTree = (spans: SimpleSpan[]): SimpleSpanTreeNode => {

  // create a map that the key is a span id and value is array of spans that have the key span as their parent span
  const childrenMap: Map<string | undefined, SimpleSpan[]> = new Map();
  spans.forEach((span) => {
    const parentSpanId = span.parentSpanId;
    const children = childrenMap.get(parentSpanId) || [];
    children.push(span);
    childrenMap.set(parentSpanId, children);
  });

  const rootSpans = childrenMap.get(undefined);
  if (!rootSpans) {
    throw new Error("No root span found");
  }
  if (rootSpans.length !== 1) {
    throw new Error("More than one root span found");
  }
  const rootSpan = rootSpans[0];
  return recursiveSpansToTree(childrenMap, rootSpan);
};
