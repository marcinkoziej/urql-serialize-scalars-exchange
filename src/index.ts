import { Exchange, Operation, OperationResult } from '@urql/core';
import { TypeNode } from 'graphql';
import {ScalarLocations, ObjectFieldTypes, TypeOrTypes} from "./locations";
export {ScalarLocations } from "./locations";

import { pipe, map } from 'wonka';


export type Serializer<T> = {
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
};

interface ObjectWithTypename {
  __typename?: string
}

// return the field types but when given an array (of interface implementations), return merged
// fields -> all possible field names with types.
// XXX we assume you have not defined two types with same field name but different type. 
const allFieldTypes = (typesMap : ObjectFieldTypes, curType: string | string[]) => {
  if (curType instanceof Array) {
    return curType.map(t => typesMap[t]).reduce((a, x) => Object.assign(a,x), {});
  } else {
    return typesMap[curType];
  }
};

const objectTypename = (data : any) : string | undefined => {
  let p : ObjectWithTypename = data;
  if (data instanceof Array) p = data[0];
  if (p.__typename) return p.__typename;
  return;
}

const serializeTree = (
  data: any,
  serializeOrDeserialize: boolean,
  //variables: any,
  //varName: string,
  initialType: TypeOrTypes,
  typesMap: ObjectFieldTypes,
  serializers: Record<string, Serializer<any>>
): any => {
  //walk data recursively
  const serialize = (ptr: any, curType: string | string[]): any => {

    // no data beyond that point.
    if (ptr === null || ptr === undefined) return ptr;

    if (typeof curType === 'string' && curType in serializers) {
      // Leaf of scalar map tree - means we arrived at the place where scalar is, lets (de)serialize
      return serializeOrDeserialize
        ? serializers[curType].serialize(ptr)
        : serializers[curType].deserialize(ptr);
    } else {
      // nested element - for array, we do not traverse the tree deeper
      if (Array.isArray(ptr)) {
        return ptr.map(elem => serialize(elem, curType));

        // object, we might have to fork here so call recursively on all the keys of cur tree node
      } else if (typeof ptr === 'object') {
        const changed = { ...ptr };
        const fieldTypes = allFieldTypes(typesMap, curType)

        for (const [field, fieldValue] of Object.entries(ptr)) {
          if (fieldValue === null) continue;
          const fieldType = fieldTypes[field] || objectTypename(fieldValue);
          if (fieldType === undefined) continue;
          changed[field] = serialize(ptr[field], fieldType);
        }
        return changed;
      } else {
        // for anything else, just return it
        return ptr;
      }
    }
  };

  return serialize(data, initialType);
};

const unpackType = (varType: TypeNode): string => {
  if (varType.kind === 'NamedType') 
    return varType.name.value;
  if (varType.kind === 'ListType' || varType.kind === 'NonNullType')
    return unpackType(varType.type);
  throw new Error(`Unsupported variable type node: ${varType}`)
};

const createSerializeScalarsExchange = (
  scalarLocations : ScalarLocations,
  serializers: Record<string, Serializer<any>>
): Exchange => ({ forward }) => {

  const serializeArgs = (op: Operation): Operation => {
    if (op.kind !== 'query') return op;

    for (const def of op.query.definitions) {
      if (def.kind === 'OperationDefinition' && def.variableDefinitions) {
        for (const varDef of def.variableDefinitions) {
          const typeName = unpackType(varDef.type);
          const varName = varDef.variable.name.value;
          if (typeName in scalarLocations.inputObjectFieldTypes) {
            op.variables[varName] = serializeTree(
              op.variables[varName],
              true,
              typeName,
              scalarLocations.inputObjectFieldTypes,
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

    const dataCopy = {...op.data};

    for (const [opName, opData] of Object.entries(op.data)) {
      if (opData === null) continue;

      const opType = scalarLocations.operationMap[opName] || objectTypename(opData);
      if (opType === undefined) continue;

      dataCopy[opName] = serializeTree(opData, false, opType, scalarLocations.outputObjectFieldTypes, serializers);
    }

    op.data = dataCopy;
    return op;
  };


  return ops$ =>
    pipe(ops$, map(serializeArgs), forward, map(deserializeResult));
};

export default createSerializeScalarsExchange;
