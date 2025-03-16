import { spansToReverseTraceTree } from "../spans-structure/reverse-trace-tree";
import { SimpleSpan } from "../simple-span";
import { spansToTraceTree } from "../spans-structure/trace-tree";
import { runJmespathQuery } from "./jmespath";
import { executeJsonPathQuery } from "./jsonpath";
import { QuerySyntax } from "./types";
import { SpansStructure } from "../spans-structure/types";

export * from "./types";

export const executeQuery = (spansArray: SimpleSpan[], querySyntax: QuerySyntax, spanStructure: SpansStructure, query: string): any => {
    console.log("executing a query: ", { querySyntax, spanStructure, query });

    let queryInputData;
    switch (spanStructure) {
        case SpansStructure.Flat:
            queryInputData = spansArray;
            break;
        case SpansStructure.Tree:
            try {
                const traceTree = spansToTraceTree(spansArray);
                queryInputData = traceTree;
            } catch (error) {
                console.error("Failed to convert spans to trace tree", error);
                return undefined;
            }
            break;
        case SpansStructure.ReverseTree:
            try {
                const reverseTraceTree = spansToReverseTraceTree(spansArray);
                queryInputData = reverseTraceTree;
            } catch (error) {
                console.error("Failed to convert spans to reverse trace tree", error);
                return undefined;
            }
            break;
        default:
            throw new Error("Unknown spans structure");
    }       

    switch (querySyntax) {
        case QuerySyntax.JMESPath:
            return runJmespathQuery(query, queryInputData);
        case QuerySyntax.JSONPath:
            return executeJsonPathQuery(query, queryInputData);
        default:
            throw new Error("Unknown query syntax");
    }
};