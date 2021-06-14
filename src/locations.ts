
export type TypeOrTypes = string | string[];

export type ObjectFieldTypes = {
    [key: string]: { [key: string]: TypeOrTypes }
};

export type OpTypes = {
    [key: string]: TypeOrTypes
};
export type ScalarLocations = {
 scalars: string[],
 inputObjectFieldTypes: ObjectFieldTypes;
 outputObjectFieldTypes: ObjectFieldTypes;
 operationMap: OpTypes;
};
