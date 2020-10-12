import * as rules from './lex-rules'
import * as srcs from './testsrcs'
import { alter, Lazy, optionalLazy, Parser, tokenLazy, token, trivialLazy, more } from '../src/parse'
import { Lexer, parseInt32Safe } from '../src/lex'

export namespace json {
  interface JsonObject {
    attributes: any[]
  }

  interface Attribute {
    name: string,
    value: JsonObject
  }

  export function object(): Parser<JsonObject> {
    return token('{').then(optionalLazy(new Lazy(json.attributes))).saveThen('attributes', tokenLazy('}')).eof().end<JsonObject>(values => {
      return { attributes: values['attributes'] || [] }
    })
  }
  export function attributes(): Parser<Attribute[]> {
    return json.attribute().saveThen('attribute', new Lazy(json.restAttributes))
  }
  export function restAttributes(): Parser<Attribute[]> {
    return alter(token(',').thenLazy(new Lazy(json.attributes)), trivialLazy([]))
  }
  export function attribute(): Parser<Attribute> {
    return token('string').saveThen('attribute.name', tokenLazy(':')).then(new Lazy(json.object)).save<Attribute>('attribute.value', values => {
      return { name: values['attribute.name'], value: values['attribute.value'] }
    })
  }

  export const lexer = new Lexer(rules.json, srcs.json, 'test.json')
}

export namespace test {
  export function ints(): Parser<number[]> {
    return more(token('integer').save('number', values => parseInt32Safe(values['number'], false)).lazy())
  }

  export const lexer = new Lexer(rules.test, srcs.test, '.test')
}
