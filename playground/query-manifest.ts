import { QuerySyntax } from "../src/queries/types";
import { SpansStructure } from "../src/spans-structure/types";

export interface QueryManifest {
    apiVersion: "simple-trace-db.odigos.io/v1";
    kind: "Query";
    metadata: {
        name: string;
    };
    spec: {
        querySyntax: QuerySyntax;
        spansStructure: SpansStructure;
        query: string;
    }
}