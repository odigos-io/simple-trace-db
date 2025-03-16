import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { QueryManifest } from './query-manifest';
import { QueryManifestSchema } from './query-scheme';
import { executeQuery } from '../src/queries';
import { SimpleSpan } from '../src/simple-span';

// extract from command argument, the name of the query to run:
const queryFileName = process.argv[2];

if (!queryFileName) {
    console.error('missing query file name. run "yarn playground -- <query-file-name>"');
    process.exit(1);
}

const queryFilePath = path.join(__dirname, 'trace-queries', `${queryFileName}.yaml`);

function loadQueryManifest(filePath: string): QueryManifest {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedYaml = yaml.parse(fileContent);
  
    // Validate at runtime
    const manifest = QueryManifestSchema.parse(parsedYaml);
    return manifest;
}

function loadExampleSpansData(fileName: string): SimpleSpan[] {
    const filePath = path.join(__dirname, 'example-data', `${fileName}.json`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
}

try {
    const queryFileContent = loadQueryManifest(queryFilePath);
    const spansArray = loadExampleSpansData('simple-demo-flat');
    const res = executeQuery(spansArray, queryFileContent.spec.querySyntax, queryFileContent.spec.spansStructure, queryFileContent.spec.query);
    console.log('query result:', res);
} catch (error) {
    console.error('failed to load query:', error);
}
  
