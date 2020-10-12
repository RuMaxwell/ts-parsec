import * as rules from './lex-rules'
import * as srcs from './testsrcs'
import { parallel, Lazy, optionalLazy, Parser, tokenLazy, token, trivialLazy, more, trivial, ifElse } from '../src/parse'
import { Lexer, parseInt32Safe, Token } from '../src/lex'

export namespace json {
  interface JsonObject {
    attributes: any[]
  }

  interface Attribute {
    name: string,
    value: JsonObject
  }

  // export function object(): Parser<JsonObject> {
  //   return token('{').then(optionalLazy(new Lazy(json.attributes))).saveThen('attributes', tokenLazy('}')).eof().end<JsonObject>(values => {
  //     return { attributes: values['attributes'] || [] }
  //   })
  // }
  // export function attributes(): Parser<Attribute[]> {
  //   return json.attribute().saveThen('attribute', new Lazy(json.restAttributes))
  // }
  // export function restAttributes(): Parser<Attribute[]> {
  //   return alter(token(',').thenLazy(new Lazy(json.attributes)), trivialLazy([]))
  // }
  // export function attribute(): Parser<Attribute> {
  //   return token('string').saveThen('attribute.name', tokenLazy(':')).then(new Lazy(json.object)).save<Attribute>('attribute.value', values => {
  //     return { name: values['attribute.name'], value: values['attribute.value'] }
  //   })
  // }

  export const lexer = new Lexer(rules.json, srcs.json, 'test.json')
}

export namespace test {
  export function ints(): Parser<number[]> {
    return ifElse(
      int().bindLazy(i => ints().bind(is => trivial(is.concat([i])))),
      trivialLazy([])
    )
  }

  export function twoInts(): Parser<[number, number]> {
    return int().bind(int0 => int().bind(int1 => trivial([int0, int1])))
  }

  export function int(): Parser<number> {
    return token('integer').translate(result => parseInt32Safe(result, false)).bind(int => token(';').translate(_ => int))
  }

  export function aOrb(): Parser<Token> {
    return parallel(tokenLazy('a'), tokenLazy('b'))
  }

  export const lexer = new Lexer(rules.test, srcs.test, 'test')
}
