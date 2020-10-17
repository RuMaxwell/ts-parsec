/**
 * @author RuMaxwell <935906960@qq.com>
 * @description A monadic parser combinator.
 */

/**
 * This monad is similar to that monad of Haskell's Parsec. Here a monadic either type is not used. The erroneus result is replaced by exception.
line :: Parsec String () [String]
line = cell >> (char ',' >> cells)

char :: Parsec String () Char
 */

import { Lexer, Token, ParseFailure, EOF, SourcePosition } from './lex'

/**
 * maximum repeat count of a `many` or `more` parser
 *
 * In web server, this is recommended to be set a finite number.
 */
const MAX_REPEAT = Infinity

// Parser definition must be wrapped with `Lazy<T>` to support circulated reference.
export class Lazy<T> {
  value: () => T
  private _value?: T

  constructor(value: () => T) {
    this.value = value
  }

  eval(): T {
    if (this._value) {
      return this._value
    } else {
      this._value = this.value()
      return this._value
    }
  }
}

// Lazy functions are used for arguments, and direct functions are used for chaining.

// The type parameter `ResultType` is only used for indication
export class Parser<ResultType> {
  // no effect on parsing, only used by the declaration of `this.parse` method
  private value: any
  _tag?: string

  constructor(lazyParse: (lexer: Lexer) => Promise<ResultType>, tag?: string) {
    this.parse = lazyParse
    this._tag = tag
  }

  // sequences
  /** monadic `>>` operator */
  then<NextType>(next: Lazy<Parser<NextType>>): Parser<NextType> {
    const thenParser = new Parser(async (lexer: Lexer) => {
      await this.parse(lexer)
      thenParser.tag(`(${this._tag} >> ${next.eval()._tag})`)
      return next.eval().parse(lexer)
    }, `(${this._tag} >> ???)`)
    return thenParser
  }

  /** monadic `>>` operator */
  thenLazy<NextType>(next: Lazy<Parser<NextType>>): Lazy<Parser<NextType>> {
    return new Lazy(() => this.then(next))
  }

  /** monadic `>>=` operator (callback version) */
  bind<NextType>(next: (result: ResultType) => Parser<NextType>): Parser<NextType> {
    const bindParser = new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      const nextParser = next(result)
      bindParser.tag(`(${this._tag} >>= ${nextParser._tag})`)
      return nextParser.parse(lexer)
    }, `(${this._tag} >>= ???)`)
    return bindParser
  }

  /** monadic `>>=` operator (callback version) */
  bindLazy<NextType>(next: (result: ResultType) => Parser<NextType>): Lazy<Parser<NextType>> {
    return new Lazy(() => this.bind(next))
  }

  // combinators
  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedBy<FollowType>(following: Lazy<Parser<FollowType>>): Parser<ResultType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      try {
        await testLazy(following).eval().parse(lexer)
        throw { notFollow: new ParseFailure((this._tag ? '`' + this._tag + '`' : '') + 'expected to not followed by ' + (following.eval()._tag ? '`' + following.eval()._tag + '`' : 'the pattern'), lexer.sp.name, lexer.sp.line, lexer.sp.column) }
      } catch (e) {
        if (e instanceof ParseFailure) {
          return result
        } else if (e.notFollow) {
          throw e.notFollow
        } else {
          throw e
        }
      }
    }, `notFollowedBy`)
  }

  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedByLazy<FollowType>(following: Lazy<Parser<FollowType>>): Lazy<Parser<ResultType>> {
    return new Lazy(() => this.notFollowedBy(following))
  }

  /** Parses the end of file. */
  eof(): Parser<ResultType> {
    return this.notFollowedBy(anyTokenLazy()).expect('end of file')
  }

  /** Returns a new parser that generate the translated result of `this` parser. */
  translate<ToType>(translation: (result: ResultType) => ToType): Parser<ToType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      return translation(result)
    }, `translate(${this._tag})`)
  }

  /** Ends the rule with a given result when parse succeeds. */
  end<T>(value: T): Parser<T> {
    return new Parser(async (lexer: Lexer) => {
      await this.parse(lexer)
      return value
    }, `end(${this._tag})`)
  }


  // utilities
  /** Wraps `this` parser with `Lazy`. */
  lazy(): Lazy<Parser<ResultType>> {
    return new Lazy(() => this)
  }

  tag(_tag: string): Parser<ResultType> {
    this._tag = _tag
    return this
  }

  /**
   * Parsec `<?>` operator. If `this` parser failed without consuming any input, it replace the expect error message with the given `message`.
   * e.g. `parser.expect('end of file')` will output `expected end of file` on error.
   */
  expect(message: string): Parser<ResultType> {
    return new Parser(async (lexer: Lexer) => {
      try {
        return await this.parse(lexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          e.msg = `expected ${message}`
          throw e
        } else {
          throw e
        }
      }
    }, `(${this._tag} <?> "${message}")`)
  }


  // lazy parse procedure, which is replaced in the constructor
  // I write it as a method instead of a field because this is cool.
  /**
   * Starts parsing with a lexer.
   * Very possibly throwing `EOF | ParseFailure` exceptions, which must be catched in the caller of `parse` method to compose proper error messages.
   * */
  async parse(lexer: Lexer): Promise<ResultType> {
    return this.value
  }

  show(lexer: Lexer) {
    this.parse(lexer)
      .then(x => {
        console.log(x)
        try {
          const tk = lexer.next() // expected to throw EOF
          console.warn('warning: not consuming all input')
        } catch (e) {
          if (!(e instanceof EOF)) {
            console.warn('warning: not consuming all input')
          }
        }
      })
      .catch(e => {
        if (e instanceof ParseFailure) {
          console.error(e.toString())
        } else {
          throw e
        }
      })
  }
}

/** A parser that results in `value` immediately without parsing. */
export function trivial<T>(value: T): Parser<T> {
  return new Parser(async () => {
    return value
  }, `trivial(${value})`)
}

/** A parser that results in `value` immediately without parsing. */
export function trivialLazy<T>(value: T): Lazy<Parser<T>> {
  return new Lazy(() => trivial(value))
}

/** Parses a token. */
export function token(tokenType: string): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    const earlySp = lexer.sp.clone()
    let token = lexer.nextExceptEOF(() => {
      lexer.sp.assign(earlySp) // resume source position because this actually consumes no input
      throw new ParseFailure(`unexpected end of file, expected ${tokenType}`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
    if (token.type === tokenType) {
      return token
    } else {
      lexer.sp.assign(earlySp) // resume source position because this actually consumes no input
      throw new ParseFailure(`expected ${tokenType}, got ${token.type}`, lexer.sp.name, token.line, token.column)
    }
  }, `token(${tokenType})`)
}

/** Parses a token. */
export function tokenLazy(tokenType: string): Lazy<Parser<Token>> {
  return new Lazy(() => token(tokenType))
}

export function tokenLiteral(tokenType: string, literal: string): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    const earlySp = lexer.sp.clone()
    let token = lexer.nextExceptEOF(() => {
      lexer.sp.assign(earlySp) // resume source position because this actually consumes no input
      throw new ParseFailure(`unexpected end of file, expected '${literal}'`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
    if (token.type === tokenType && token.literal === literal) {
      return token
    } else {
      lexer.sp.assign(earlySp) // resume source position because this actually consumes no input
      throw new ParseFailure(`expected '${literal}', got '${token.literal}'`, lexer.sp.name, token.line, token.column)
    }
  }, `tokenLiteral(${tokenType}, ${literal})`)
}

export function tokenLiteralLazy(tokenType: string, literal: string): Lazy<Parser<Token>> {
  return new Lazy(() => tokenLiteral(tokenType, literal))
}

/** Parses an arbitrary token. */
export function anyToken(): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    const earlySp = lexer.sp.clone()
    return lexer.nextExceptEOF(() => {
      lexer.sp.assign(earlySp) // resume source position because this actually consumes no input
      throw new ParseFailure(`unexpected end of file, expected a token`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
  }, 'anyToken')
}

/** Parses an arbitrary token. */
export function anyTokenLazy(): Lazy<Parser<Token>> {
  return new Lazy(() => anyToken())
}

/**
 * Tries to parse an occurrence of the parser.
 * If succeeds, returns the result, or else returns `undefined`.
 */
export function optional<T>(what: Lazy<Parser<T>>): Parser<T | void> {
  return ifElse(what, trivialLazy(undefined))
}

/**
 * Tries to parse an occurrence of the parser.
 * If succeeds, returns the result, or else returns `undefined`.
 */
export function optionalLazy<T>(what: Lazy<Parser<T>>): Lazy<Parser<T | void>> {
  return new Lazy(() => optional(what))
}

/**
 * Tries to parse an occurrence of the parser whose result is expected to be an array.
 * If succeeds, returns the result, or else returns `[]`.
 */
export function optionalList<T>(what: Lazy<Parser<T[]>>): Parser<T[]> {
  return ifElse(what, trivialLazy([]))
}

/**
 * Tries to parse an occurrence of the parser whose result is expected to be an array.
 * If succeeds, returns the result, or else returns `[]`.
 */
export function optionalListLazy<T>(what: Lazy<Parser<T[]>>): Lazy<Parser<T[]>> {
  return new Lazy(() => optionalList(what))
}

/**
 * Parses *zero* or more occurrence of a sequence the parser accepts.
 * For each attempt, if the parser failed with consuming input, the `many` parser also fails.
 * If the parser failed without consuming input, the `many` parser ends successfully.
 *
 * `ones() { return many(one) }` should work the same with `ones() { return ifElse(one.eval().bindLazy(x => ones().bind(xs => trivial([x].concat(xs)))), trivialLazy([])) }`, but with higher performance.
 * Or `ones ::= many(one)` <=> `ones ::= do { x <- one; xs <- ones; return (x:xs) } <|> return []` if you prefer Haskell representation.
 */
export function many<T>(one: Lazy<Parser<T>>): Parser<T[]> {
  const result: T[] = []
  return new Parser(async (lexer: Lexer) => {
    for (let i = 0; i < MAX_REPEAT; i++) {
      const earlySp = lexer.sp.clone()
      try {
        const r = await one.eval().parse(lexer)
        result.push(r)
      } catch (e) {
        if (e instanceof ParseFailure || e instanceof EOF) {
          if (lexer.sp.compareTo(earlySp) !== 'equal') {
            // if consumed, the error must be thrown
            throw e
          }
          return result
        } else {
          throw e
        }
      }
    }
    console.warn(`warning: pattern repeated too many times, some of the result are no longer parsed (maximum = ${MAX_REPEAT})`)
    return result
  }, 'many')
}

/** Parses *zero* or more occurrence of a sequence the parser accepts. */
export function manyLazy<T>(one: Lazy<Parser<T>>): Lazy<Parser<T[]>> {
  return new Lazy(() => many(one))
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function more<T>(one: Lazy<Parser<T>>): Parser<T[]> {
  return one.eval().bind(x => many(one).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  }))
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function moreLazy<T>(one: Lazy<Parser<T>>): Lazy<Parser<T[]>> {
  return new Lazy(() => more(one))
}

/**
 * Parses two branches simultaneously, with the support of different types of results. It does NOT backtrack and consume the input to the maximum possibility.
 *
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail, an error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
export function parallel<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const ifLexer = lexer.clone()
    const elseLexer = lexer.clone()
    const ifPromise = (async () => {
      try {
        return await ifParser.eval().parse(ifLexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          return e
        } else {
          throw e
        }
      }
    })()
    const elsePromise = (async () => {
      try {
        return await elseParser.eval().parse(elseLexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          return e
        } else {
          throw e
        }
      }
    })()
    return new Promise((resolve, reject) => {
      Promise.all([ifPromise, elsePromise])
      .then(([ifResult, elseResult]) => {
        if (ifResult instanceof ParseFailure && elseResult instanceof ParseFailure) {
          reject(ifResult.combine(elseResult))
        } else if (ifResult instanceof ParseFailure) {
          lexer.sp.assign(elseLexer.sp)
          resolve(elseResult as ElseType)
        } else if (elseResult instanceof ParseFailure) {
          lexer.sp.assign(ifLexer.sp)
          resolve(ifResult as IfType)
        } else {
          if (ifLexer.sp.compareTo(elseLexer.sp) === 'forward') {
            lexer.sp.assign(elseLexer.sp)
          } else {
            lexer.sp.assign(ifLexer.sp)
          }
          reject(new Error(`syntax ambiguity found in parallel parser` +
            (ifParser.eval()._tag ? `if = '${ifParser.eval()._tag}'` : '') +
            (elseParser.eval()._tag ? `else = '${elseParser.eval()._tag}'` : '') +
            `\nwhere results are ${ifResult}, ${elseResult}`))
        }
      })
      .catch(err => {
        reject(err)
      })
    })
  }, 'parallel')
}

/**
 * Parses two branches in parallel, with the support of different types of results. It does NOT backtrack and consume the input to the maximum possibility.
 *
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail, a combined error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
export function parallelLazy<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Lazy<Parser<IfType | ElseType>> {
  return new Lazy(() => parallel(ifParser, elseParser))
}

/**
 * Alternative `<|>` operator, with the support of different types of results. It DOES backtrack when `ifParser` fails.
 *
 * The parser first tries to parse the `ifParser`, and if failed and consuming no input, parses the `elseParser`.
 * If `ifParser` fails and consumes the input, the error generated by it is thrown without checking the `elseParser`.
 * If both failed, a combined error is thrown when `elseParser` consumes no input, or else only throws the error generated by `elseParser`.
 */
export function ifElse<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const earlyLexer = lexer.clone() // backtrack is implemented by saving the early lexer state
    try {
      return await ifParser.eval().parse(lexer)
    } catch (e) {
      if (e instanceof ParseFailure) {
        if (lexer.sp.compareTo(earlyLexer.sp) !== 'equal') {
          // if-branch consumes, the error is thrown without checking the else-branch
          throw e
        }
        const elseLexer = earlyLexer.clone()
        try {
          const elseResult = await elseParser.eval().parse(elseLexer)
          lexer.sp.assign(elseLexer.sp)
          return elseResult
        } catch (e1) {
          if (elseLexer.sp.compareTo(earlyLexer.sp) !== 'equal') {
            // else-branch consumes, the error is thrown without combination
            throw e1
          }
          if (e1 instanceof ParseFailure) {
            throw e1.combine(e)
          } else {
            throw e1
          }
        }
      } else {
        throw e
      }
    }
  }, 'ifElse')
}

/**
 * Alternative `<|>` operator, with the support of different types of results. It DOES backtrack when `ifParser` fails.
 *
 * The parser first tries to parse the `ifParser`, and if failed (consuming no input), parses the `elseParser`. If both failed, a combined error is thrown.
 */
export function ifElseLazy<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Lazy<Parser<IfType | ElseType>> {
  return new Lazy(() => ifElse(ifParser, elseParser))
}

/**
 * Tries every choice in the parser list, until one succeeds.
 *
 * If all fails, only the error of the one who consumes the most input is thrown. If multiple ones consume the same most input, a combined error of them is thrown.
 * Or else, the first successful result is returned.
 */
export function choices<ResultType>(...parsers: Lazy<Parser<any>>[]): Parser<ResultType> {
  return new Parser(async (lexer: Lexer) => {
    let errs: { err: ParseFailure, sp: SourcePosition }[] = []
    for (let i = 0; i < parsers.length; i++) {
      const newLexer = lexer.clone()
      try {
        const result = await parsers[i].eval().parse(newLexer)
        lexer.sp.assign(newLexer.sp)
        return result
      } catch (e) {
        if (e instanceof ParseFailure && i + 1 < parsers.length) {
          errs.push({ err: e, sp: newLexer.sp.clone() })
          continue
        } else if (e instanceof ParseFailure) { // the last error
          errs.push({ err: e, sp: newLexer.sp.clone() })
          // console.log(errs.map(e => ({ msg: e.err.msg, rest: e.sp.rest, l: e.sp.line, c: e.sp.column })))
          errs = mostConsumedErrors(errs)
          // console.log('----------')
          // console.log(errs.map(e => ({ msg: e.err.msg, rest: e.sp.rest, l: e.sp.line, c: e.sp.column })))
          if (errs.length === 1) {
            throw errs[0].err
          } else {
            e = errs[0].err
            for (let j = 1; j < errs.length; j++) {
              e = e.combine(errs[j].err)
            }
            throw e
          }
        } else {
          throw e
        }
      }
    }
  }, 'choices')
}

function mostConsumedErrors(errs: { err: ParseFailure, sp: SourcePosition }[]): { err: ParseFailure, sp: SourcePosition }[] {
  if (!errs.length) {
    return []
  }
  let most = [errs[0]]
  for (let i = 1; i < errs.length; i++) {
    if (errs[i].sp.compareTo(most[0].sp) === 'forward') {
      most = [errs[i]]
    } else if (errs[i].sp.compareTo(most[0].sp) === 'equal') {
      most.push(errs[i])
    }
  }
  return most
}

/**
 * Tries every choice in the parser list, until one succeeds.
 *
 * If all fails, only the error of the one who consumes the most input is thrown. If multiple ones consume the same most input, a combined error of them is thrown.
 * Or else, the first successful result is returned.
 */
export function choicesLazy<ResultType>(...parsers: Lazy<Parser<any>>[]): Lazy<Parser<ResultType>> {
  return new Lazy(() => choices(...parsers))
}

export function moreSeparated<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Parser<T[]> {
  return one.eval().bind(x => many(separator.eval().thenLazy(one)).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  }))
}

export function moreSeparatedLazy<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => moreSeparated(one, separator))
}

export function manySeparated<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Parser<T[]> {
  return ifElse(moreSeparatedLazy(one, separator), trivialLazy([]))
}

export function manySeparatedLazy<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => manySeparated(one, separator))
}

export function moreSeparatedOptionalEnd<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Parser<T[]> {
  return one.eval().bind(x => many(attemptLazy(separator.eval().thenLazy(one))).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  })).bind(xs => optional(separator).end(xs))
}

export function moreSeparatedOptionalEndLazy<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => moreSeparatedOptionalEnd(one, separator))
}

export function manySeparatedOptionalEnd<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Parser<T[]> {
  return ifElse(moreSeparatedOptionalEndLazy(one, separator), trivialLazy([]))
}

export function manySeparatedLazyOptionalEndLazy<T, SepT>(one: Lazy<Parser<T>>, separator: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => manySeparated(one, separator))
}

export function moreEndWith<T, SepT>(one: Lazy<Parser<T>>, endWith: Lazy<Parser<SepT>>): Parser<T[]> {
  return more(one.eval().bindLazy(x => endWith.eval().end(x)))
}

export function moreEndWithLazy<T, SepT>(one: Lazy<Parser<T>>, endWith: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => moreEndWith(one, endWith))
}

export function manyEndWith<T, SepT>(one: Lazy<Parser<T>>, endWith: Lazy<Parser<SepT>>): Parser<T[]> {
  return many(one.eval().bindLazy(x => endWith.eval().end(x)))
}

export function manyEndWithLazy<T, SepT>(one: Lazy<Parser<T>>, endWith: Lazy<Parser<SepT>>): Lazy<Parser<T[]>> {
  return new Lazy(() => moreEndWith(one, endWith))
}

/**
 * Tries to parse the specified parser and returns the result, but consume no input.
 */
export function test<T>(what: Lazy<Parser<T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    return what.eval().parse(lexer.clone())
  }, 'test')
}

/**
 * Tries to parse the specified parser and returns the result, but consume no input.
 */
export function testLazy<T>(what: Lazy<Parser<T>>): Lazy<Parser<T>> {
  return new Lazy(() => test(what))
}

/**
 * Tries to parse the specified parser, if succeeded, consumes input and returns the result; if failed, consumes no input.
 *
 * It has the same effect as `test(what).then(what)`, but more efficient because it does not parse again.
 */
export function attempt<T>(what: Lazy<Parser<T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const newLexer = lexer.clone()
    const result = await what.eval().parse(newLexer) // if error here, lexer will keep the same
    lexer.sp.assign(newLexer.sp)
    return result
  }, 'attempt')
}

/**
 * Tries to parse the specified parser, if succeeded, consumes input and returns the result; if failed, consumes no input.
 */
export function attemptLazy<T>(what: Lazy<Parser<T>>): Lazy<Parser<T>> {
  return new Lazy(() => attempt(what))
}

/** Monad combinator `liftM`. Translate the result of a parser into a new structure. */
export function translate<A, B>(translation: (a: A) => B, pa: Parser<A>): Parser<B> {
  return new Parser(async (lexer: Lexer) => {
    const resultOfA = await pa.parse(lexer)
    return translation(resultOfA)
  })
}

/** Monad combinator `liftM2`. Combine the results of two parsers into a new structure. */
export function combine2<A, B, C>(combination: (a: A, b: B) => C, pa: Parser<A>, pb: Parser<B>): Parser<C> {
  return new Parser(async (lexer: Lexer) => {
    const promiseOfA = pa.parse(lexer)
    const promiseOfB = pb.parse(lexer)
    return new Promise(resolve => {
      Promise.all([promiseOfA, promiseOfB])
      .then(([resultOfA, resultOfB]) => {
        resolve(combination(resultOfA, resultOfB))
      })
    })
  })
}

/** Monad combinator `liftM3`. Combine the results of three parsers into a new structure. */
export function combine3<A, B, C, D>(combination: (a: A, b: B, c: C) => D, pa: Parser<A>, pb: Parser<B>, pc: Parser<C>): Parser<D> {
  return new Parser(async (lexer: Lexer) => {
    const promiseOfA = pa.parse(lexer)
    const promiseOfB = pb.parse(lexer)
    const promiseOfC = pc.parse(lexer)
    return new Promise(resolve => {
      Promise.all([promiseOfA, promiseOfB, promiseOfC])
      .then(([resultOfA, resultOfB, resultOfC]) => {
        resolve(combination(resultOfA, resultOfB, resultOfC))
      })
    })
  })
}

/** Monad combinator `liftM4`. Combine the results of four parsers into a new structure. */
export function combine4<A, B, C, D, E>(combination: (a: A, b: B, c: C, d: D) => E, pa: Parser<A>, pb: Parser<B>, pc: Parser<C>, pd: Parser<D>): Parser<E> {
  return new Parser(async (lexer: Lexer) => {
    const promiseOfA = pa.parse(lexer)
    const promiseOfB = pb.parse(lexer)
    const promiseOfC = pc.parse(lexer)
    const promiseOfD = pd.parse(lexer)
    return new Promise(resolve => {
      Promise.all([promiseOfA, promiseOfB, promiseOfC, promiseOfD])
      .then(([resultOfA, resultOfB, resultOfC, resultOfD]) => {
        resolve(combination(resultOfA, resultOfB, resultOfC, resultOfD))
      })
    })
  })
}

/** Combine the results of any number of parsers into a new structure. */
export function combineMany<CombinedType>(combination: (results: any[]) => CombinedType, ...parsers: Parser<any>[]): Parser<CombinedType> {
  if (parsers.length === 0) {
    return new Parser(async (_) => {
      return combination([])
    })
  }
  return new Parser(async (lexer: Lexer) => {
    const promises = parsers.map(parser => parser.parse(lexer))
    return new Promise(resolve => {
      Promise.all(promises)
      .then(results => {
        resolve(combination(results))
      })
    })
  })
}
