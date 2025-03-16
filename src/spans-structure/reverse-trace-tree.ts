import { SimpleSpan } from "../simple-span";

export interface SimpleSpanReverseTreeNode {
  // the "Simple Span" object that this node represents
  span: SimpleSpan;

  // the parent of this node, or undefined if this is the root node
  parent?: SimpleSpanReverseTreeNode;
}

export const spansToReverseTraceTree = (
  spans: SimpleSpan[]
): SimpleSpanReverseTreeNode[] => {
  // create a map from span id to span
  const spanMap: Map<string, SimpleSpan> = new Map(
    spans.map((span) => [span.spanId, span])
  );

  // create a SimpleSpanReverseTreeNode for each span with no parent
  const treeNodes: Map<string, SimpleSpanReverseTreeNode> = new Map(spans.map((span) => [span.spanId, { span }]));
  treeNodes.forEach((node, spanId) => {
    const parentSpanId = node.span.parentSpanId;
    if (parentSpanId) {
        const parent = treeNodes.get(parentSpanId);
        if (parent) {
            node.parent = parent;
        } else {
            throw new Error(`Incomplete tree: parent span ${parentSpanId} not found for span ${spanId}`);
        }
    }
  });

  return Array.from(treeNodes.values());
};
