/**
 * This monad is not that monad of Haskell's Parsec. Here a monadic either type is not used. The erroneus result is replaced by exception.
line :: Parsec String () [String]
line = cell >> (char ',' >> cells)

char :: Parsec String () Char
 */

import { Lexer, Token, ParseFailure } from './lex'

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
      return this.value()
    }
  }
}

// Lazy functions are used for arguments, and direct functions are used for chaining.

// The type parameter `ResultType` is only used for indication
export class Parser<ResultType> {
  private value: any
  // Lazy parser cannot bind nickname to its value when created, so this is not initialized in the constructor. It is only assigned in `saveThen` method.
  nickname?: string
  savedValues: { [keys: string]: any }

  constructor(lazyParse: (lexer: Lexer) => Promise<ResultType>, savedValues?: { [keys: string]: any }) {
    this.parse = lazyParse
    this.savedValues = savedValues || {}
  }

  // sequences
  /** monadic `>>` operator */
  then<NextType>(next: Lazy<Parser<NextType>>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      await this.parse(lexer)
      return next.eval().parse(lexer)
    }, this.savedValues)
  }

  /** monadic `>>` operator */
  thenLazy<NextType>(next: Lazy<Parser<NextType>>): Lazy<Parser<NextType>> {
    return new Lazy(() => this.then(next))
  }

  /** monadic `>>=` operator (callback version) */
  bind<NextType>(next: (result: ResultType) => Parser<NextType>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      return next(result).parse(lexer)
    }, this.savedValues)
  }

  /** monadic `>>=` operator (callback version) */
  bindLazy<NextType>(next: (result: ResultType) => Parser<NextType>): Lazy<Parser<NextType>> {
    return new Lazy(() => this.bind(next))
  }

  /** monadic `>>=` operator (chain version) */
  saveThen<NextType>(name: string, next: Lazy<Parser<NextType>>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      next.eval().savedValues[name] = await this.parse(lexer)
      this.nickname = name
      return next.eval().parse(lexer)
    }, this.savedValues)
  }

  /** monadic `>>=` operator (chain version) */
  saveThenLazy<NextType>(name: string, next: Lazy<Parser<NextType>>): Lazy<Parser<NextType>> {
    return new Lazy(() => this.saveThen(name, next))
  }


  // combinators
  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedBy<FollowType>(following: Lazy<Parser<FollowType>>): Parser<void> {
    return new Parser(async (lexer: Lexer) => {
      this.parse(lexer)
      try {
        await testLazy(following).eval().parse(lexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          return
        } else {
          throw e
        }
      }
    }, this.savedValues)
  }

  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedByLazy<FollowType>(following: Lazy<Parser<FollowType>>): Lazy<Parser<void>> {
    return new Lazy(() => this.notFollowedBy(following))
  }

  /** Parses the end of file. */
  eof(): Parser<void> {
    return this.notFollowedByLazy(anyTokenLazy()).eval().expect('end of file')
  }


  // utilities
  /** Ends the rule and returns its result when parse succeeds. */
  end(): Parser<ResultType>
  /** Ends the rule and returns a specified result named by nickname when parse succeeds. */
  end<T>(name: string): Parser<T>
  /** Ends the rule and returns a result composed by the function when parse succeeds. */
  end<T>(composer: (savedValues: { [keys: string]: any }) => T): Parser<T>
  end<T>(name?: string | ((savedValues: { [keys: string]: any }) => T)): Parser<T | ResultType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      if (typeof name === 'string') {
        return this.savedValues[name]
      } else if (typeof name === 'function') {
        return name(this.savedValues)
      } else {
        return result
      }
    }, this.savedValues)
  }

  /** Saves itself and ends the rules; returns its result when parse succeeds. */
  save(thisName: string): Parser<ResultType>
  /** Saves itself and ends the rules; returns a specified result by nickname when parse succeeds. */
  save<T>(thisName: string, refName: string): Parser<T>
  /** Saves itself and ends the rules; returns a result composed by the function when parse succeeds. */
  save<T>(thisName: string, composer: (savedValues: { [keys: string]: any }) => T): Parser<T>
  save<T>(thisName: string, refName?: string | ((savedValues: { [keys: string]: any }) => T)): Parser<T | ResultType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      this.savedValues[thisName] = result
      if (typeof refName === 'string') {
        return this.savedValues[name]
      } else if (typeof refName === 'function') {
        return refName(this.savedValues)
      } else {
        return result
      }
    }, this.savedValues)
  }

  lazy(): Lazy<Parser<ResultType>> {
    return new Lazy(() => this)
  }

  /**
   * Parsec `<?>` operator. If `this` parser failed without consuming any input, it replace the expect error message with the given `message`.
   * e.g. `parser.expect('end of file')` will output `expected end of file` on error.
   */
  expect(message: string): Parser<ResultType> {
    return new Parser(async (lexer: Lexer) => {
      try {
        return this.parse(lexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          e.msg = message
          throw e
        } else {
          throw e
        }
      }
    }, this.savedValues)
  }


  // lazy parse procedure
  /**
   * Starts parsing with a lexer.
   * Very possibly throwing `EOF | ParseFailure` exceptions, which must be catched in the caller of `parse` method to compose proper error messages.
   * */
  async parse(lexer: Lexer): Promise<ResultType> {
    return this.value
  }
}

/** A parser that results in `value` immediately without parsing. */
export function trivial<T>(value: T): Parser<T> {
  return new Parser(async () => {
    return value
  })
}

/** A parser that results in `value` immediately without parsing. */
export function trivialLazy<T>(value: T): Lazy<Parser<T>> {
  return new Lazy(() => trivial(value))
}

/** Parses a token. */
export function token(tokenType: string): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    let token = lexer.nextExceptEOF(() => {
      throw new ParseFailure(`unexpected end of file, expected ${tokenType}`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
    if (token.type === tokenType) {
      return token
    } else {
      throw new ParseFailure(`expected ${tokenType}, got ${token.type}`, lexer.sp.name, token.line, token.column)
    }
  })
}

/** Parses a token. */
export function tokenLazy(tokenType: string): Lazy<Parser<Token>> {
  return new Lazy(() => token(tokenType))
}

/** Parses an arbitrary token. */
export function anyToken(): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    return lexer.nextExceptEOF(() => {
      throw new ParseFailure(`unexpected end of file, expected a token`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
  })
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
  return alter(what, trivialLazy(undefined))
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
  return alter(what, trivialLazy([]))
}

/**
 * Tries to parse an occurrence of the parser whose result is expected to be an array.
 * If succeeds, returns the result, or else returns `[]`.
 */
export function optionalListLazy<T>(what: Lazy<Parser<T[]>>): Lazy<Parser<T[]>> {
  return new Lazy(() => optionalList(what))
}

/** Parses *zero* or more occurrence of a sequence the parser accepts. */
export function many<T>(one: Lazy<Parser<T>>): Parser<T[]> {
  const result: T[] = []
  return new Parser(async (lexer: Lexer) => {
    for (let i = 0; i < MAX_REPEAT; i++) {
      const r = await one.eval().parse(lexer)
      result.push(r)
    }
    return result
  }, one.eval().savedValues)
}

/** Parses *zero* or more occurrence of a sequence the parser accepts. */
export function manyLazy<T>(one: Lazy<Parser<T>>): Lazy<Parser<T[]>> {
  return new Lazy(() => many(one))
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function more<T>(one: Lazy<Parser<T>>): Parser<T[]> {
  return one.eval().then(manyLazy(one))
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function moreLazy<T>(one: Lazy<Parser<T>>): Lazy<Parser<T[]>> {
  return new Lazy(() => more(one))
}

/**
 * Alternative `<|>` operator, but with the support of different types of the results. It does not backtrack and consume the input to the maximum possibility.
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail, an error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
export function alter<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const ifPromise = (async () => {
      try {
        return ifParser.eval().parse(lexer)
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
        return elseParser.eval().parse(lexer.clone())
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
          reject(ifResult.bind(elseResult))
        } else if (ifResult instanceof ParseFailure) {
          resolve(elseResult as ElseType)
        } else if (elseResult instanceof ParseFailure) {
          resolve(ifResult as IfType)
        } else {
          reject(new Error(`syntax ambiguity found in alter parser` +
            (ifParser.eval().nickname ? `if = '${ifParser.eval().nickname}'` : '') +
            (elseParser.eval().nickname ? `else = '${elseParser.eval().nickname}'` : '') +
            `\nwhere results are ${ifResult}, ${elseResult}`))
        }
      })
      .catch(err => {
        reject(err)
      })
    })
  }, { ...ifParser.eval().savedValues, ...elseParser.eval().savedValues })
}

/**
 * Alternative `<|>` operator, but with the support of different types of the results. It does not backtrack and consume the input to the maximum possibility.
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail, an error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
export function alterLazy<IfType, ElseType>(ifParser: Lazy<Parser<IfType>>, elseParser: Lazy<Parser<ElseType>>): Lazy<Parser<IfType | ElseType>> {
  return new Lazy(() => alter(ifParser, elseParser))
}

/**
 * Tries to parse with the specified parser but consume no input.
 */
export function test<T>(what: Lazy<Parser<T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    return what.eval().parse(lexer.clone())
  }, what.eval().savedValues)
}

/**
 * Tries to parse with the specified parser but consume no input.
 */
export function testLazy<T>(what: Lazy<Parser<T>>): Lazy<Parser<T>> {
  return new Lazy(() => test(what))
}

/** Monad combinator `liftM`. Translate the result of a parser into a new structure. */
export function translate<A, B>(translation: (a: A) => B, pa: Parser<A>): Parser<B> {
  return new Parser(async (lexer: Lexer) => {
    const resultOfA = await pa.parse(lexer)
    return translation(resultOfA)
  }, pa.savedValues)
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
  }, { ...pa.savedValues, ...pb.savedValues })
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
  }, { ...pa.savedValues, ...pb.savedValues, ...pc.savedValues })
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
  }, { ...pa.savedValues, ...pb.savedValues, ...pc.savedValues, ...pd.savedValues })
}

/** Combine the results of any number of parsers into a new structure. */
export function combineMany<CombinedType>(combination: (results: any[]) => CombinedType, ...parsers: Parser<any>[]): Parser<CombinedType> {
  if (parsers.length === 0) {
    return new Parser(async (_) => {
      return combination([])
    })
  }

  let savedValues: { [keys: string]: any } = {}
  for (let i = 0; i < parsers.length; i++) {
    Object.assign(savedValues, parsers[i].savedValues)
  }
  return new Parser(async (lexer: Lexer) => {
    const promises = parsers.map(parser => parser.parse(lexer))
    return new Promise(resolve => {
      Promise.all(promises)
      .then(results => {
        resolve(combination(results))
      })
    })
  }, savedValues)
}
