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

// The type parameter `ResultType` is only used for indication
export class Parser<ResultType> {
  private value: any
  // 0 - not parsed, 1 - successful, 2 - failed
  private state: number = 0
  private minRepeat?: number
  private maxRepeat?: number
  nickname?: string
  savedValues: { [keys: string]: any }

  constructor(lazyParse: (lexer: Lexer) => Promise<ResultType>, savedValues?: { [keys: string]: any })
  constructor(config?: {
    // use an object to allow `ResultType` == `void`
    trivial?: { value: ResultType },
    // `max` is allowed to be `+Infinity`, `max` must be greater than `min`
    repeat?: { min: number, max: number },
    savedValues?: { [keys: string]: any },
  })
  constructor(config?: ((lexer: Lexer) => Promise<ResultType>) | { trivial?: { value: ResultType }, repeat?: { min: number, max: number }, savedValues?: { [keys: string]: any }}, savedValues?: { [keys: string]: any }) {
    if (typeof config === 'function') {
      this.parse = config
      this.savedValues = savedValues || {}
    } else if (typeof config === 'object') {
      if (config.trivial !== undefined) {
        this.value = config.trivial.value
        this.state = 2
      }
      if (config.repeat) {
        const { min, max } = config.repeat
        if (min >= max) {
          throw new Error('error on parser construction: config.repeat: maximum repeat number must be greater than minimum repeat number')
        }
        this.minRepeat = config.repeat.min
        this.maxRepeat = config.repeat.max
      }
      this.savedValues = config.savedValues || {}
    } else {
      throw 'nonsense'
    }
  }

  // sequences
  /** monadic `>>` operator */
  then<NextType>(next: Parser<NextType>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      await this.parse(lexer)
      return next.parse(lexer)
    }, this.savedValues)
  }

  /** monadic `>>=` operator (callback version) */
  bind<NextType>(next: (result: ResultType) => Parser<NextType>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      const result = await this.parse(lexer)
      return next(result).parse(lexer)
    }, this.savedValues)
  }

  /** monadic `>>=` operator (chain version) */
  saveThen<NextType>(name: string, next: Parser<NextType>): Parser<NextType> {
    return new Parser(async (lexer: Lexer) => {
      next.savedValues[name] = await this.parse(lexer)
      this.nickname = name
      return next.parse(lexer)
    }, this.savedValues)
  }


  // combinators
  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedBy<FollowType>(following: Parser<FollowType>): Parser<void> {
    return new Parser(async (lexer: Lexer) => {
      this.parse(lexer)
      try {
        await test(following).parse(lexer)
      } catch (e) {
        if (e instanceof ParseFailure) {
          return
        } else {
          throw e
        }
      }
    }, this.savedValues)
  }

  /** Parses the end of file. */
  eof(): Parser<void> {
    return this.notFollowedBy(anyToken()).expect('end of file')
  }


  // utilities
  /** Ends the rule and tell the parser to return its result when parse succeeds. */
  end(): Parser<ResultType>
  /** Ends the rule and tell the parser to return a specified result named by `saveThen` when parse succeeds. */
  end<T>(name: string): Parser<T>
  /** Ends the rule and tell the parser to return a result composed by the function when parse succeeds. */
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
function trivial<T>(value: T): Parser<T> {
  return new Parser(async () => {
    return value
  })
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

/** Parses an arbitrary token. */
export function anyToken(): Parser<Token> {
  return new Parser(async (lexer: Lexer) => {
    return lexer.nextExceptEOF(() => {
      throw new ParseFailure(`unexpected end of file, expected a token`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    })
  })
}

/**
 * Tries to parse an occurrence of a sequence the parser accepts.
 * If succeeds, returns the result, or else returns `undefined`.
 */
export function optional<T>(what: Parser<T>): Parser<T | void> {
  return alter(what, trivial(undefined))
}

/** Parses *zero* or more occurrence of a sequence the parser accepts. */
export function many<T>(one: Parser<T>): Parser<T[]> {
  const result: T[] = []
  return new Parser(async (lexer: Lexer) => {
    for (let i = 0; i < MAX_REPEAT; i++) {
      const r = await one.parse(lexer)
      result.push(r)
    }
    return result
  }, one.savedValues)
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function more<T>(one: Parser<T>): Parser<T[]> {
  return one.then(many(one))
}

/**
 * Alternative `<|>` operator, but with the support of different types of the results. It does not backtrack and consume the input to the maximum possibility.
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail, an error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
export function alter<IfType, ElseType>(ifParser: Parser<IfType>, elseParser: Parser<ElseType>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const ifPromise = (async () => {
      try {
        return ifParser.parse(lexer)
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
        return elseParser.parse(lexer.clone())
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
            (ifParser.nickname ? `if = '${ifParser.nickname}'` : '') +
            (elseParser.nickname ? `else = '${elseParser.nickname}'` : '') +
            `\nwhere results are ${ifResult}, ${elseResult}`))
        }
      })
      .catch(err => {
        reject(err)
      })
    })
  }, { ...ifParser.savedValues, ...elseParser.savedValues })
}

/**
 * Tries to parse with the specified parser but consume no input.
 */
export function test<T>(what: Parser<T>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    return what.parse(lexer.clone())
  }, what.savedValues)
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
