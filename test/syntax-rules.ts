import * as rules from './lex-rules'
import * as srcs from './testsrcs'
import { parallel, Lazy, Parser, token, more, trivial, ifElse, many, attempt, tokenLiteral, moreSeparated, moreSeparatedOptionalEnd, optional, moreEndWith, manySeparated, choices, syntax, identity, chainLeftMore, chainRightMore, string, manySeparatedOptionalEnd } from '../src/parse'
import { Lexer, ParseFailure, parseInt32Safe, parseSafeInt, SafeInt, Token } from '../src/lex'
import { REPLCommand } from 'repl'

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

// function choices1<ResultType>(...parsers: (Parser<any> | Lazy<Parser<any>>)[]): Parser<ResultType> {
//   return foldr(parsers, ifElse, new Lazy(() => parserZero<ResultType>())).eval()
// }

export namespace json {
  export type JsonAny = number | string | boolean | null | JsonAny[] | json.JsonObject

  export type JsonObject = { [attributes: string]: JsonAny }

  export interface Attribute {
    name: string,
    value: JsonAny
  }

  export function object(): Parser<JsonObject> {
    return choices(
      token('integer').translate(x => parseInt32Safe(x, false)),
      token('float').translate(x => parseFloat(x.literal)),
      token('string').translate(x => x.literal),
      token('null').end(null),
      token('boolean').translate(x => x.literal === 'true'),
      token('[').then(manySeparated(syntax(object), token(',')).bind(xs => token(']').end(xs))),
      token('{').then(
        manySeparated(
          token('string').bind(name => token(':').then(syntax(object)).bind(value => trivial<json.Attribute>({ name: name.literal, value }))),
          token(',')
        )
        .bind(xs => token('}')
        .end((function () {
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

export namespace expr {
  interface IExpr {
    op: string
    [keys: string]: any
  }

  export function expr(): Parser<number | SafeInt | string | boolean | null | Record<string, any>> {
    return ifElse(syntax(atom), syntax(conditional))
  }

  export function conditional(): Parser<{ op: 'conditional', cond: any, THEN: any, ELSE: any }> {
    return token('if')
      .then(syntax(expr))
      .bind(cond => syntax(groupExpr)
      .bind(THEN => token('else')
      .then(syntax(groupExpr)
      .translate(ELSE => ({ op: 'conditional', cond, THEN, ELSE })))))
  }

  export function tuple(): Parser<{ op: 'tuple', items: any[] }> {
    return string('(')
      .then(manySeparatedOptionalEnd(syntax(expr), string(',')))
      .bind(items => string(')')
      .end({ op: 'tuple', items }))
  }

  export function list(): Parser<{ op: 'list', items: any[] }> {
    return string('[')
      .then(manySeparatedOptionalEnd(syntax(expr), string(',')))
      .bind(items => string(']')
      .end({ op: 'list', items }))
  }

  export function pair(): Parser<{ key: string, value: any }> {
    return token('id')
      .bind(key => optional(
        string(':')
          .then(syntax(expr))
          .translate(value => ({ key: key.literal, value }))
      )
      .translate(pair => pair || { key: key.literal, value: undefined }))
  }

  export function map(): Parser<{ op: 'map', pairs: { key: string, value: any }[] }> {
    return string('{')
      .then(manySeparatedOptionalEnd(syntax(pair), string(',')))
      .bind(pairs => string('}')
      .end({ op: 'map', pairs }))
  }

  export function groupExpr(): Parser<{ op: 'group', exprs: any[] }> {
    return string('{')
      .then(manySeparatedOptionalEnd(syntax(expr), string(';')))
      .bind(exprs => string('}')
      .end({ op: 'group', exprs }))
  }

  export function atom(): Parser<number | SafeInt | string | boolean | null | IExpr> {
    return choices(
      token('float').translate(tk => parseFloat(tk.literal)),
      token('integer').translate(tk => parseSafeInt(tk, false)),
      token('string').translate(tk => tk.literal.slice(1, -1)),
      token('true').end(true),
      token('false').end(false),
      token('null').end(null),
      syntax(tuple),
      syntax(list),
      syntax(groupExpr)
    )
  }

  export const start = expr

  export const lexer = new Lexer(rules.test, srcs.test, 'expr')
}

export namespace test {
  export function leftRecursive(): Parser<number> {
    return chainLeftMore(token('integer').bind(tk => trivial(parseInt(tk.literal))), trivial((x: number, y: number) => x - y))
  }

  export const start = leftRecursive

  export const lexer = new Lexer(rules.test, srcs.test, 'test')
}
