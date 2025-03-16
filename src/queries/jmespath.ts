import jmespath from 'jmespath';

export const runJmespathQuery = (jmespathExpression: string, data: any): any => {
    return jmespath.search(data, jmespathExpression);
};
