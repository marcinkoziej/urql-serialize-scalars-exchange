import { Exchange, Operation, OperationResult } from '@urql/core';
import { TypeNode } from 'graphql';

import { pipe, map } from 'wonka';
// Typescript graphql is broken and will not work with above schema.json

export type ScalarTreeNode = { [key: string]: ScalarTreeNode | string };
export type Serializer<T> = {
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
};

const serializeTree = (
  data: any,
  serializeOrDeserialize: boolean,
  //variables: any,
  //varName: string,
  scalarMap: ScalarTreeNode | string,
  serializers: Record<string, Serializer<any>>
): any => {
  //walk data recursively
  const serialize = (ptr: any, cur: ScalarTreeNode | string): any => {
    // no data beyond that point.
    if (ptr === null || ptr === undefined) return ptr;

    if (typeof cur === 'string') {
      // Leaf of scalar map tree - means we arrived at the place where scalar is, lets (de)serialize
      return serializeOrDeserialize
        ? serializers[cur].serialize(ptr)
        : serializers[cur].deserialize(ptr);
    } else {
      // nested element - for array, we do not traverse the tree deeper
      if (Array.isArray(ptr)) {
        return ptr.map(elem => serialize(elem, cur));

        // object, we might have to fork here so call recursively on all the keys of cur tree node
      } else if (typeof ptr === 'object') {
        const changed = { ...ptr };
        for (const [field, node] of Object.entries(cur)) {
          if (field in ptr) changed[field] = serialize(ptr[field], node);
        }
        return changed;
      } else {
        // for anything else, just return it
        return ptr;
      }
    }
  };

  return serialize(data, scalarMap);
};

const unpackType = (varType: TypeNode): string => {
  if (varType.kind === 'NamedType') 
    return varType.name.value;
  if (varType.kind === 'ListType' || varType.kind === 'NonNullType')
    return unpackType(varType.type);
  throw new Error(`Unsupported variable type node: ${varType}`)
};

const createSerializeScalarsExchange = (
  inputScalarTree: ScalarTreeNode,
  outputScalarTree: ScalarTreeNode,
  serializers: Record<string, Serializer<any>>
): Exchange => ({ forward }) => {
  const serializeArgs = (op: Operation): Operation => {
    if (op.kind !== 'query') return op;

    for (const def of op.query.definitions) {
      if (def.kind === 'OperationDefinition' && def.variableDefinitions) {
        for (const varDef of def.variableDefinitions) {
          const typeName = unpackType(varDef.type);
          const varName = varDef.variable.name.value;
          if (typeName in inputScalarTree) {
            op.variables[varName] = serializeTree(
              op.variables[varName],
              true,
              inputScalarTree[typeName],
              serializers
            );
          }
        }
      }
    }

    return op;
  };

  const deserializeResult = (op: OperationResult): OperationResult => {
    if (
      op.data === null ||
      op.data === undefined ||
      op.operation.kind !== 'query'
    )
      return op;

    op.data = serializeTree(op.data, false, outputScalarTree, serializers);
    return op;
  };

  return ops$ =>
    pipe(ops$, map(serializeArgs), forward, map(deserializeResult));
};

export default createSerializeScalarsExchange;
