import * as rules from './lex-rules'
import * as srcs from './testsrcs'
import { parallel, Lazy, optionalLazy, Parser, tokenLazy, token, trivialLazy, more, trivial, ifElse, manyLazy, many, attempt, attemptLazy, testLazy, ifElseLazy, tokenLiteral, moreSeparated, moreSeparatedOptionalEnd, optional, moreEndWith, manySeparated, choices } from '../src/parse'
import { Lexer, ParseFailure, parseInt32Safe, Token } from '../src/lex'

// foldr :: [a] -> (a -> b -> b) -> b -> b
function foldr<A, B>(container: A[], folder: (item: A, accumulation: B) => B, init: B): B {
  if (container.length <= 0) { return init }
  let acc = init
  for (let i = container.length - 1; i >= 0; i--) {
    acc = folder(container[i], acc)
  }
  return acc
}

function parserZero<T>(): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    throw new ParseFailure('mzero', lexer.sp.name, lexer.sp.line, lexer.sp.column)
  })
}

function choices1<ResultType>(...parsers: Lazy<Parser<any>>[]): Parser<ResultType> {
  return foldr(parsers, ifElseLazy, new Lazy(() => parserZero<ResultType>())).eval()
}

export namespace json {
  export type JsonAny = number | string | boolean | null | JsonAny[] | json.JsonObject

  export type JsonObject = { [attributes: string]: JsonAny }

  export interface Attribute {
    name: string,
    value: JsonAny
  }

  export function object(): Parser<JsonObject> {
    return choices(
      token('integer').translate(x => parseInt32Safe(x, false)).lazy(),
      token('float').translate(x => parseFloat(x.literal)).lazy(),
      token('string').translate(x => x.literal).lazy(),
      token('null').end(null).lazy(),
      token('boolean').translate(x => x.literal === 'true').lazy(),
      token('[').thenLazy(manySeparated(new Lazy(object), tokenLazy(',')).bindLazy(xs => token(']').end(xs))),
      token('{').thenLazy(manySeparated(
        token('string').bindLazy(name => token(':').then(new Lazy(object)).bind(value => trivial<json.Attribute>({ name: name.literal, value }))),
        tokenLazy(',')).bindLazy(xs => token('}').end((function () {
          const obj: json.JsonObject = {}
          xs.forEach(x => {
            obj[x.name] = x.value
          })
          return obj
        })()))
      ),
    )
  }

  export const start = () => object().eof()

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

  export function a_b_c_d(): Parser<json.JsonAny> {
    return choices(
      // token('integer').then(tokenLazy('float')).lazy(),
      // token('integer').then(tokenLazy('integer')).then(tokenLazy('float')).lazy(),
      token('integer').translate(x => parseInt32Safe(x, false)).lazy(),
      token('float').translate(x => parseFloat(x.literal)).lazy(),
      token('string').translate(x => x.literal).lazy(),
      token('null').end(null).lazy(),
      token('boolean').translate(x => x.literal === 'true').lazy(),
      token('[').thenLazy(manySeparated(new Lazy(a_b_c_d), tokenLazy(',')).bindLazy(xs => token(']').end(xs))),
      token('{').thenLazy(manySeparated(
        token('string').bindLazy(name => token(':').then(new Lazy(a_b_c_d)).bind(value => trivial<json.Attribute>({ name: name.literal, value }))),
        tokenLazy(',')).bindLazy(xs => token('}').end((function () {
          const obj: json.JsonObject = {}
          xs.forEach(x => {
            obj[x.name] = x.value
          })
          return obj
        })()))
      ),
    )
  }

  export const start = a_b_c_d

  export const lexer = new Lexer(rules.test, srcs.test, 'test')
}
