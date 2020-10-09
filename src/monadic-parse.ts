/**
 * This monad is not that monad of Haskell's Parsec. Here a monadic either type is not used. The erroneus result is replaced by exception.
line :: Parsec String () [String]
line = cell >> (char ',' >> cells)

char :: Parsec String () Char
 */

import { Lexer, Token } from './lex'

class Parser<ResultType> {
  lexer?: Lexer

  constructor() {
  }

  // sequences
  /** monadic `>>` operator */
  then<NextType>(next: Parser<NextType>): Parser<NextType> {
  }

  /** monadic `>>=` operator (callback version) */
  bind<NextType>(next: (result: ResultType) => Parser<NextType>): Parser<NextType> {
  }

  /** monadic `>>=` operator (chain version) */
  saveThen<NextType>(name: string, next: Parser<NextType>): Parser<NextType> {
  }


  // combinators
  /**
   * Not consuming the input, specify `this` parser cannot followed by a sequence that `following` parser accepts.
   * If `this` is followed with `following`, the generated parser fails, or else succeeds.
   */
  notFollowedBy<FollowType>(following: Parser<FollowType>): Parser<void> {
  }

  /** Parses the end of file. */
  eof(): Parser<void> {
    return this.notFollowedBy(begin().anyToken()).expect('end of file')
  }


  // utilities
  /** Ends the rule and tell the parser to return its result when parse succeeds. */
  end(): Parser<ResultType>
  /** Ends the rule and tell the parser to return a specified result named by `saveThen` when parse succeeds. */
  end(name: string): Parser<any>
  end(name?: string): Parser<any> {
  }

  /**
   * Parsec `<?>` operator. If `this` parser failed without consuming any input, it replace the expect error message with the given `message`.
   * e.g. `parser.expect('end of file')` will output `expected end of file` on error.
   */
  expect(message: string): Parser<ResultType> {
  }


  /** Starts parsing with a lexer. */
  parse(lexer: Lexer): any {
  }
}

/** Starts a rule. */
function begin(): Parser<void> {
  return new Parser()
}

/** Parses a token. */
function token(tokenType: string): Parser<Token> {
}

/** Parses an arbitrary token. */
function anyToken(): Parser<Token> {
}

/**
 * Tries to parse an occurrence of a sequence the parser accepts.
 * If succeeds, returns the result, or else returns `undefined`.
 */
function optional<T>(what: Parser<T>): Parser<T | void> {
}

/** Parses *zero* or more occurrence of a sequence the parser accepts. */
function many<T>(one: Parser<T>): Parser<T[]> {
}

/** Parses *one* or more occurrence of a sequence the parser accepts. */
function more<T>(one: Parser<T>): Parser<T[]> {
}

/**
 * Alternative `<|>` operator, but with the support of different types of the results. It does not backtrack and consume the input to the maximum possibility.
 * When parsing, the two parsers (`this` and `other`) parse in parallel. Each try to parse until they both succeed or failed.
 * If one fails, the branch dies and casts off its intermediate results.
 * If both fail and no other branches exist, an error is thrown.
 * If both succeed but one consumes more tokens than the other, the former is taken and the latter is treated as failed.
 * If both succeed and consume the same number of tokens, the ambiguity is reported.
 */
function alter<ElseType>(other: Parser<ElseType>): Parser<ResultType | ElseType> {
}

/**
 * `Try` does not backtrack and does not consume the input if not succeeded.
 * When parsing, the parser splits into two branches. One parses `what`, the other skips `what` and parses the rest parsers. Each try to parse to the end of input.
 * If one failed, the branch dies and casts off its intermediate results.
 * If both failed and no other branches exists, an error will be thrown.
 * If none failed at last, the ambiguity will be reported.
 */
function Try<T>(what: Parser<T>): Parser<T> {
}

/** Monad combinator `liftM2`. Combine the results of two parsers into a new structure. */
function combine2<A, B, C>(combination: (a: A, b: B) => C, pa: Parser<A>, pb: Parser<B>): Parser<C> {
}

/** Monad combinator `liftM3`. Combine the results of three parsers into a new structure. */
function combine3<A, B, C, D>(combination: (a: A, b: B, c: C) => D, pa: Parser<A>, pb: Parser<B>, pc: Parser<C>): Parser<D> {
}

/** Monad combinator `liftM4`. Combine the results of four parsers into a new structure. */
function combine4<A, B, C, D, E>(combination: (a: A, b: B, c: C, d: D) => E, pa: Parser<A>, pb: Parser<B>, pc: Parser<C>, pd: Parser<D>): Parser<E> {
}

/** Combine the results of any number of parsers into a new structure. */
function combineMany<CombinedType>(combination: (...results: any[]) => CombinedType, ...parsers: Parser<any>[]): Parser<CombinedType> {
}
