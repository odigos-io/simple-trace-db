
export enum SpansStructure {
    Flat = "Flat", // an array of simple spans
    Tree = "Tree", // a tree node for the root with span and children array of more tree nodes
    ReverseTree = "ReverseTree", // an array of nodes with span and parent node
}
