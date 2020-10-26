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

function unlazy<T>(parser: Parser<T> | Lazy<Parser<T>>): Parser<T> {
  if (parser instanceof Lazy) {
    return parser.eval()
  } else {
    return parser
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
  then<NextType>(next: Parser<NextType> | Lazy<Parser<NextType>>): Parser<NextType> {
    const thenParser = new Parser(async (lexer: Lexer) => {
      if (next instanceof Lazy) { next = next.eval() }
      const _next = next as Parser<NextType>
      await this.parse(lexer)
      thenParser.tag(`(${this._tag} >> ${_next._tag})`)
      return _next.parse(lexer)
    }, `(${this._tag} >> ???)`)
    return thenParser
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

  // combinators
  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is not followed with `following`, the generated parser succeeds. On any other condition (including `this` parser's failure), the generated parser fails.
   */
  notFollowedBy<FollowType>(following: Parser<FollowType> | Lazy<Parser<FollowType>>): Parser<ResultType> {
    return new Parser(async (lexer: Lexer) => {
      const _following = unlazy(following)
      const result = await this.parse(lexer)
      try {
        await test(_following).parse(lexer)
        throw { notFollow: new ParseFailure((this._tag ? '`' + this._tag + '`' : '') + 'expected to not followed by ' + (_following._tag ? '`' + _following._tag + '`' : 'the pattern'), lexer.sp.name, lexer.sp.line, lexer.sp.column) }
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

  /** Parses the end of file. */
  eof(): Parser<ResultType> {
    return this.notFollowedBy(anyToken()).expect('end of file')
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

export function syntax<T>(rule: () => Parser<T>): Lazy<Parser<T>> {
  return new Lazy(rule)
}

/** A parser that results in `value` immediately without parsing. */
export function trivial<T>(value: T): Parser<T> {
  return new Parser(async () => {
    return value
  }, `trivial(${value})`)
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

/** Parses a bare literal string. If failed, no input is consumed. */
export function string(literal: string): Parser<string> {
  return new Parser(async (lexer: Lexer) => {
    if (lexer.sp.rest.startsWith(literal)) {
      lexer.sp.advance(literal.length)
      return literal
    } else {
      throw new ParseFailure(`expected '${literal}', got '${literal}'`, lexer.sp.name, lexer.sp.line, lexer.sp.column)
    }
  })
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

export function identity<T>(parser: Parser<T> | Lazy<Parser<T>>): Parser<T> {
  return trivial(undefined).then(parser)
}

/**
 * Tries to parse an occurrence of the parser.
 * If succeeds, returns the result, or else returns `undefined`.
 */
export function optional<T>(what: Parser<T> | Lazy<Parser<T>>): Parser<T | void> {
  return ifElse(what, trivial(undefined))
}

/**
 * Tries to parse an occurrence of the parser whose result is expected to be an array.
 * If succeeds, returns the result, or else returns `[]`.
 */
export function optionalList<T>(what: Parser<T[]> | Lazy<Parser<T[]>>): Parser<T[]> {
  return ifElse(what, trivial([]))
}

/**
 * Parses *zero* or more occurrence of a sequence the parser accepts.
 * For each attempt, if the parser failed with consuming input, the `many` parser also fails.
 * If the parser failed without consuming input, the `many` parser ends successfully.
 *
 * `ones() { return many(one) }` should work the same with `ones() { return ifElse(one.eval().bindLazy(x => ones().bind(xs => trivial([x].concat(xs)))), trivialLazy([])) }`, but with higher performance.
 * Or `ones ::= many(one)` <=> `ones ::= do { x <- one; xs <- ones; return (x:xs) } <|> return []` if you prefer Haskell representation.
 */
export function many<T>(one: Parser<T> | Lazy<Parser<T>>): Parser<T[]> {
  return new Parser(async (lexer: Lexer) => {
    const _one = unlazy(one)
    const result: T[] = []
    for (let i = 0; i < MAX_REPEAT; i++) {
      const earlySp = lexer.sp.clone()
      try {
        const r = await _one.parse(lexer)
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

/** Parses *one* or more occurrence of a sequence the parser accepts. */
export function more<T>(one: Parser<T> | Lazy<Parser<T>>): Parser<T[]> {
  return identity(one).bind(x => many(one).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  }))
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
export function parallel<IfType, ElseType>(ifParser: Parser<IfType> | Lazy<Parser<IfType>>, elseParser: Parser<ElseType> | Lazy<Parser<ElseType>>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const _ifParser = unlazy(ifParser)
    const _elseParser = unlazy(elseParser)
    const ifLexer = lexer.clone()
    const elseLexer = lexer.clone()
    const ifPromise = (async () => {
      try {
        return await _ifParser.parse(ifLexer)
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
        return await _elseParser.parse(elseLexer)
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
            (_ifParser._tag ? `if = '${_ifParser._tag}'` : '') +
            (_elseParser._tag ? `else = '${_elseParser._tag}'` : '') +
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
 * Alternative `<|>` operator, with the support of different types of results. It DOES backtrack when `ifParser` fails.
 *
 * The parser first tries to parse the `ifParser`, and if failed and consuming no input, parses the `elseParser`.
 * If `ifParser` fails and consumes the input, the error generated by it is thrown without checking the `elseParser`.
 * If both failed, a combined error is thrown when `elseParser` consumes no input, or else only throws the error generated by `elseParser`.
 */
export function ifElse<IfType, ElseType>(ifParser: Parser<IfType> | Lazy<Parser<IfType>>, elseParser: Parser<ElseType> | Lazy<Parser<ElseType>>): Parser<IfType | ElseType> {
  return new Parser(async (lexer: Lexer) => {
    const _ifParser = unlazy(ifParser)
    const _elseParser = unlazy(elseParser)
    const earlyLexer = lexer.clone() // backtrack is implemented by saving the early lexer state
    try {
      return await _ifParser.parse(lexer)
    } catch (e) {
      if (e instanceof ParseFailure) {
        if (lexer.sp.compareTo(earlyLexer.sp) !== 'equal') {
          // if-branch consumes, the error is thrown without checking the else-branch
          throw e
        }
        const elseLexer = earlyLexer.clone()
        try {
          const elseResult = await _elseParser.parse(elseLexer)
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
 * Tries every choice in the parser list, until one succeeds.
 *
 * If all fails, only the error of the one who consumes the most input is thrown. If multiple ones consume the same most input, a combined error of them is thrown.
 * Or else, the first successful result is returned.
 */
export function choices<ResultType>(...parsers: (Parser<any> | Lazy<Parser<any>>)[]): Parser<ResultType> {
  return new Parser(async (lexer: Lexer) => {
    const _parsers = parsers.map(unlazy)
    let errs: { err: ParseFailure, sp: SourcePosition }[] = []
    for (let i = 0; i < _parsers.length; i++) {
      const newLexer = lexer.clone()
      try {
        const result = await _parsers[i].parse(newLexer)
        lexer.sp.assign(newLexer.sp)
        return result
      } catch (e) {
        if (e instanceof ParseFailure && i + 1 < _parsers.length) {
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

/** Parses *one* or more occurrence of `one` separated by `separator`. */
export function moreSeparated<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, separator: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return identity(one).bind(x => many(identity(separator).then(one)).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  }))
}

/** Parses *zero* or more occurrence of `one` separated by `separator`. */
export function manySeparated<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, separator: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return ifElse(moreSeparated(one, separator), trivial([]))
}

/** Parses *one* or more occurrence of `one` separated by `separator`, and ends with one optional occurrence of `separator`. */
export function moreSeparatedOptionalEnd<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, separator: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return identity(one).bind(x => many(attempt(identity(separator).then(one))).bind(xs => {
    xs.unshift(x)
    return trivial(xs)
  })).bind(xs => optional(separator).end(xs))
}

/** Parses *zero* or more occurrence of `one` separated by `separator`, and ends with one optional occurrence of `separator`. */
export function manySeparatedOptionalEnd<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, separator: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return ifElse(moreSeparatedOptionalEnd(one, separator), trivial([]))
}

/** Parses *one* or more occurrence of `one`, every ended with one occurrence of `separator`. */
export function moreEndWith<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, endWith: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return more(identity(one).bind(x => identity(endWith).end(x)))
}

/** Parses *zero* or more occurrence of `one`, every ended with one occurrence of `separator`. */
export function manyEndWith<T, SepT>(one: Parser<T> | Lazy<Parser<T>>, endWith: Parser<SepT> | Lazy<Parser<SepT>>): Parser<T[]> {
  return many(identity(one).bind(x => identity(endWith).end(x)))
}

export function chainLeftMore<T>(expr: Parser<T> | Lazy<Parser<T>>, operator: Parser<(x: T, y: T) => T> | Lazy<Parser<(x: T, y: T) => T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _expr = unlazy(expr)
    const _operator = unlazy(operator)

    function rest(x: T): Parser<T> {
      return new Parser(async (lexer: Lexer) => {
        try {
          const f = await _operator.parse(lexer)
          const y = await _expr.parse(lexer)
          return rest(f(x, y)).parse(lexer)
        } catch (e) {
          if (e instanceof ParseFailure) {
            return x
          } else {
            throw e
          }
        }
      }, 'chainLeftMore::rest')
    }

    const x = await _expr.parse(lexer)
    return rest(x).parse(lexer)
  }, 'chainLeftMore')
}

export function chainRightMore<T>(expr: Parser<T> | Lazy<Parser<T>>, operator: Parser<(x: T, y: T) => T> | Lazy<Parser<(x: T, y: T) => T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _expr = unlazy(expr)
    const _operator = unlazy(operator)

    function scan(): Parser<T> {
      return new Parser(async (lexer: Lexer) => {
        const x = await _expr.parse(lexer)
        return rest(x).parse(lexer)
      }, 'chainRightMore::scan')
    }

    function rest(x: T): Parser<T> {
      return new Parser(async (lexer: Lexer) => {
        try {
          const f = await _operator.parse(lexer)
          const y = await scan().parse(lexer)
          return f(x, y)
        } catch (e) {
          if (e instanceof ParseFailure) {
            return x
          } else {
            throw e
          }
        }
      }, 'chainRightMore::rest')
    }

    return scan().parse(lexer)
  }, 'chainRightMore')
}

export function anyLeftMore<T>(expr: Parser<any> | Lazy<Parser<any>>, operator: Parser<(x: any, y: any) => any> | Lazy<Parser<(x: any, y: any) => any>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _expr = unlazy(expr)
    const _operator = unlazy(operator)

    function rest(x: any): Parser<any> {
      return new Parser(async (lexer: Lexer) => {
        try {
          const f = await _operator.parse(lexer)
          const y = await _expr.parse(lexer)
          return rest(f(x, y)).parse(lexer)
        } catch (e) {
          if (e instanceof ParseFailure) {
            return x
          } else {
            throw e
          }
        }
      }, 'anyLeftMore::rest')
    }

    const x = await _expr.parse(lexer)
    return rest(x).parse(lexer)
  }, 'anyLeftMore')
}

export function anyRightMore<T>(expr: Parser<any> | Lazy<Parser<any>>, operator: Parser<(x: any, y: any) => any> | Lazy<Parser<(x: any, y: any) => any>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _expr = unlazy(expr)
    const _operator = unlazy(operator)

    function scan(): Parser<any> {
      return new Parser(async (lexer: Lexer) => {
        const x = await _expr.parse(lexer)
        return rest(x).parse(lexer)
      }, 'anyRightMore::scan')
    }

    function rest(x: any): Parser<any> {
      return new Parser(async (lexer: Lexer) => {
        try {
          const f = await _operator.parse(lexer)
          const y = await scan().parse(lexer)
          return f(x, y)
        } catch (e) {
          if (e instanceof ParseFailure) {
            return x
          } else {
            throw e
          }
        }
      }, 'anyRightMore::rest')
    }

    return scan().parse(lexer)
  }, 'anyRightMore')
}

// An operator-precedence parser.
export function arithmetic<ResultT>(
  precedenceLevels: (
    {
      operatorParser: Parser<any> | Lazy<Parser<any>>,
      operandParsers: (Parser<any> | Lazy<Parser<any>>)[],
      associativity: 'none' | 'left' | 'right',
      calculation: (...operands: any[]) => any,
    } | {
      operatorParser: Parser<any> | Lazy<Parser<any>>,
      operandParsers: (Parser<any> | Lazy<Parser<any>>)[],
      associativity: 'none' | 'left' | 'right',
      calculation: (...operands: any[]) => any,
    }[]
  )[]
): Parser<ResultT> {
  async function matchOperator(lexer: Lexer) {
    for (let i = 0; i < precedenceLevels.length; i++) {
      const precedenceLevel = precedenceLevels[i]
      if (precedenceLevel instanceof Array) {
        for (let j = 0; j < precedenceLevel.length; j++) {
          const operation = precedenceLevel[j]
          try {
            const op = await attempt(operation.operatorParser).parse(lexer)
          } catch (e) {
          }
        }
      }
    }
  }
}

/**
 * Tries to parse the specified parser and returns the result, but consume no input.
 */
export function test<T>(what: Parser<T> | Lazy<Parser<T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _what = unlazy(what)
    return _what.parse(lexer.clone())
  }, 'test')
}

/**
 * Tries to parse the specified parser, if succeeded, consumes input and returns the result; if failed, consumes no input.
 *
 * It has the same effect as `test(what).then(what)`, but more efficient because it does not parse again.
 */
export function attempt<T>(what: Parser<T> | Lazy<Parser<T>>): Parser<T> {
  return new Parser(async (lexer: Lexer) => {
    const _what = unlazy(what)
    const newLexer = lexer.clone()
    const result = await _what.parse(newLexer) // if error here, lexer will keep the same
    lexer.sp.assign(newLexer.sp)
    return result
  }, 'attempt')
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
