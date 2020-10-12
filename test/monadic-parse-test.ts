import { alter, optional, Parser, token, translate } from "../src/monadic-parse";

interface JsonObject {
  attributes: any[]
}

namespace json {
  export const object: Parser<JsonObject> = token('{').then(json.attributes).then(token('}')).eof().end<JsonObject>(savedValues => { return { attributes: savedValues.attributes } })
  export const attributes: Parser<any[] | void> = optional(json.attribute.saveThen('attribute', token(',')).then(json.attributes))
  export const attribute: Parser<any> = token('string').saveThen('attribute.name', token(':')).then(json.object).end()
}
