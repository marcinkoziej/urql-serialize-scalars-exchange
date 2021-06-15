# Urql serialize scalars exchange

## What is this?

- Exchange for urql GraphQL client
- Can serialize custom scalar types (Date, DateTime, Json string) in arguments
- Can deserialize custom scalar types in responses

This exchange is inspired by [url-custom-scalars-exchange](https://github.com/clentfort/urql-custom-scalars-exchange), but does not import the graphql schema which can be really big. Instead, it uses scalar location information which show where structurally the scalar of particular type can appear in arguments and results. 

## What problem does it solve? 

GraphQL is good because it makes data in API type-defined. However, the number of supported scalars (primitive types) is limited and although you can define custom ones on the server side, you can't easily do this on client side.

In our case we allow a field to have `Json` type which is serialized and deserialized on the server, but on the client we need to do this by hand, so for example, we will have `Post` type with `metadata` field of type `Json`, which can contain arbitrary metadata. To update such a page, the PostInput variable could look like:

``` 
variables.postInput = {
  title: "Foo",
  slug: "foo-bar",
  content: "Hello!",
  metadata: '{"category":"manual","promote":true}'
}
```

With `urql-serialize-scalars-exchange` you can nest the object in a more natural way, and the exchange will serialize it using provided serializer:
The scalar locations contain information, that `PostInput` type can have metadata field of type `Json`, and if you pass an object in that metadata field, it will be serialized with JSON.stringify and sent to the server as string. 
On the server side, it will be de-serialized again and resolver will receive a map, not string.

``` 
variables.postInput = {
  title: "Foo",
  slug: "foo-bar",
  content: "Hello!",
  metadata: {
    category: "manual",
    promote: true
  }
}
```

You have to define serializer and deserializer function for every custom scalar type.
The serializer/deserializer could look like so:
```
{
 Json: {
   serialize: (v: any) => typeof v === 'string' ? v : JSON.stringify(v),
   deserialize: (v: string) => JSON.parse(v),
 },
}
```

You can define similar ones for Dates, DateTimes, Money, any other scalar type you have defined in GraphQL server.

## Usage

Add this package to the project.

```
const serializeScalarsExchange = createSerializeScalarsExchange(
  scalarLocations,
{
  Json: {
    serialize: (v: any) => typeof v === 'string' ? v : JSON.stringify(v),
    deserialize: (v: string) => JSON.parse(v),
    },
  }
);

// then add serializeScalarsExchange before other exchanges when creating urql client
```
The scalarLocations contain information on where scalars are in types and responses, and you can generate this file using codegen, using [codegen-graphql-scalar-locations](https://www.npmjs.com/package/codegen-graphql-scalar-locations) plugin.

Example for scalarLocations (this is just a part of it, taken from [Proca action tool](https://proca.app):
```
export type ObjectFieldTypes = {
    [key: string]: { [key: string]: string | string[] }
};

export type OpTypes = {
    [key: string]: string | string[]
};

export type ScalarLocations = {
 scalars: string[],
 inputObjectFieldTypes: ObjectFieldTypes;
 outputObjectFieldTypes: ObjectFieldTypes;
 operationMap: OpTypes;
};

export const scalarLocations : ScalarLocations = {
  "inputObjectFieldTypes": {
    ...
    "CampaignInput": {
      "config": "Json",
      "actionPages": "ActionPageInput"
    },
    "ContactInput": {
      "address": "AddressInput",
      "nationality": "NationalityInput"
    }
  },
  "outputObjectFieldTypes": {
    "Contact": {
      "publicKey": "KeyIds",
      "signKey": "KeyIds"
    },
    "OrgCount": {
      "org": [
        "PrivateOrg",
        "PublicOrg"
      ]
    },
    "PublicCampaign": {
      "config": "Json",
      "stats": "CampaignStats",
      "org": [
        "PrivateOrg",
        "PublicOrg"
      ],
      "actions": "PublicActionsResult"
    }
  },
  "operationMap": {
    "campaigns": [
      "PrivateCampaign",
      "PublicCampaign"
    ],
    "upsertCampaign": [
      "PrivateCampaign",
      "PublicCampaign"
    ],
    ...
  },
  "scalars": [
    "Json"
  ]
};
```

The input scalars has all the types that have custom scalar nested somewhere, and the position of the custom scalar field is indicated by object structure - the string value at the leaf designates the scalar name.
For output scalars, we have similar structure but without the types - the top-level keys of outputScalars are query or mutation names which are given back in results.

## Limitations 

- This library has no fragments support - just because I do not use them and did not plan it for v0.1. Please contribute them, it should not be hard!

- Please mind this is best for a situation where you use a fixed set of queries, so you know what their names are; if you use grapqhql-tag and aliases for instance, the scalarLocations will not contain an aliased result. 
Because graphql results do not contain any typing data, it is impossible to be smarter about this without bundling a schema (which we want to avoid due to its size).
However, this is enough good approach to use if you generate all your api calls using graphql codegen - you get not only TypeScript types for all queries and arguments, but you can also do serialization/deserialization based on this.
