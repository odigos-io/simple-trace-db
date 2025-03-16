import jsonpath from 'jsonpath';

export const executeJsonPathQuery = (jsonPathExpression: string, data: any): any => {
    const noWhitespaces = jsonPathExpression.replace(/\s/g, '');
    return jsonpath.query(data, noWhitespaces);
}