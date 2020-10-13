import * as rules from './lex-rules'
import * as srcs from './testsrcs'
import { parallel, Lazy, optionalLazy, Parser, tokenLazy, token, trivialLazy, more, trivial, ifElse, manyLazy, many, attempt, attemptLazy, testLazy, ifElseLazy, tokenLiteral, moreSeparated, moreSeparatedOptionalEnd, optional, moreEndWith, manySeparated } from '../src/parse'
import { Lexer, parseInt32Safe, Token } from '../src/lex'

export namespace json {
  interface JsonObject {
    attributes: any[]
  }

  interface Attribute {
    name: string,
    value: JsonObject
  }

  export function object(): Parser<JsonObject> {
    return token('{').then(new Lazy(attributes)).bind(attrs => token('}').end({ attributes: attrs }))
  }
  export function attributes(): Parser<Attribute[]> {
    return manySeparated(new Lazy(attribute), tokenLazy(','))
  }
  export function attribute(): Parser<Attribute> {
    return token('string').bind(name => token(':').then(new Lazy(object)).bind(value => trivial({ name: name.literal, value })))
  }

  export const start = object

  export const lexer = new Lexer(rules.json, srcs.json, 'test.json')
}

export namespace test {
  export function intsEndByComma(): Parser<number[]> {
    return moreEndWith(new Lazy(int), tokenLazy(',')).tag(intsEndByComma.name)
  }

  export function moreInts(): Parser<number[]> {
    return more(new Lazy(int)).tag(moreInts.name)
  }

  export function manyInts(): Parser<number[]> {
    return many(new Lazy(int)).tag(manyInts.name)
  }

  export function ints(): Parser<number[]> {
    return ifElse(
      int().bindLazy(i => ints().bind(is => trivial([i].concat(is)))),
      trivialLazy([])
    ).tag(ints.name)
  }

  export function twoInts(): Parser<[number, number]> {
    return int().bind(int0 => int().bind(int1 => trivial([int0, int1])))
  }

  export function int(): Parser<number> {
    return token('integer').translate(result => parseInt32Safe(result, false))
  }

  export function aa_ab(): Parser<Token | void> {
    return ifElse(attemptLazy(token('a').thenLazy(tokenLazy('a'))), token('a').thenLazy(tokenLazy('b'))).eof()
  }

  export const start = intsEndByComma

  export const lexer = new Lexer(rules.test, srcs.test, 'test')
}
