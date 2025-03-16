// schema.ts
import { z } from 'zod';
import { QuerySyntax } from '../src/queries';
import { SpansStructure } from '../src/spans-structure/types';

// Schema definition for runtime validation
export const QueryManifestSchema = z.object({
  apiVersion: z.literal('simple-trace-db.odigos.io/v1'),
  kind: z.literal('Query'),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    querySyntax: z.nativeEnum(QuerySyntax),
    spansStructure: z.nativeEnum(SpansStructure),
    query: z.string(),
  }),
});
