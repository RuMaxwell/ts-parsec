/**
 * Usage:
 * import { EOF, LexFailure, Token, RuleSet, Lexer } from 'path/to/lex'
 * import { Failure, Try } from 'path/to/catcher'
 *
 * const ruleSet = new RuleSet({
 *   ...
 * })
 *
 * const lexer = new Lexer(ruleSet, source)
 *
 * // for presentation
 * lexer.show()
 *
 * // get all tokens at once
 * const tokens = lexer.allTokens()
 *
 * // use tokens one by one
 * let gen = lexer.iterate()
 * for (let t = gen.next(); !t.done; t = gen.next()) {
 *   console.log(t.value)
 * }
 */

import { Try, Failure } from './catcher'
import JSBI from 'jsbi'
import { group } from 'console'

export class EOF {
  toString() { return 'EOF' }
}

/** must be caught */
export class ParseFailure {
  msg: string
  sourceName: string
  line: number
  column: number

  constructor(msg: string, sourceName: string, line: number, column: number) {
    this.msg = msg
    this.sourceName = sourceName
    this.line = line
    this.column = column
  }

  combine(...others: ParseFailure[]): ParseFailure {
    return new ParseFailures(this, ...others)
  }

  toString() {
    return (this.sourceName.length > 0 ? `${this.sourceName} - ` : '') + `parse error` + (this.line > 0 && this.column > 0 ? ` at line ${this.line}, column ${this.column}` : '') + `: ${this.msg}`
  }
}

export class ParseFailures extends ParseFailure {
  pfs: ParseFailure[] = []

  constructor(...pfs: ParseFailure[]) {
    super('', '', 0, 0)
    this.pfs = pfs
  }

  combine(...others: ParseFailure[]): ParseFailure {
    const pfss = others.filter(x => x instanceof ParseFailures)
    const pfs = others.filter(x => !(x instanceof ParseFailures))
    this.pfs.push(...pfs)
    for (let i = 0; i < pfss.length; i++) {
      this.pfs.push(...(pfss[i] as ParseFailures).pfs)
    }
    return this
  }

  toString() {
    return `${this.pfs.length} error(s):\n` + this.pfs.map(x => x.toString()).join('\n')
  }
}

export class UnexpectedEOF extends ParseFailure {
  constructor(sourceName: string) {
    super('unexpected end of file', sourceName, 0, 0)
  }

  toString() {
    return 'parse error' + (this.sourceName.length > 0 ? ` in ${this.sourceName}` : '') + ' : unexpected end of file'
  }
}

// avoid type check for a === b
function eq(a: any, b: any): boolean {
  return a === b
}

function isDigit(x: string): boolean {
  let char = x.charCodeAt(0)
  return char >= 0x30 && char <= 0x39
}

function isOctal(x: string): boolean {
  let char = x.charCodeAt(0)
  return char >= 0x30 && char <= 0x37
}

function isHexadecimal(x: string): boolean {
  let char = x.charCodeAt(0)
  return isDigit(x) || char >= 0x41 && char <= 0x46 || char >= 0x61 && char <= 0x66
}

export class Lexer {
  ruleSet: RuleSet
  sp: SourcePosition

  constructor(ruleSet: RuleSet, source: string, sourceName?: string) {
    this.ruleSet = ruleSet
    this.sp = new SourcePosition(source, sourceName)
  }

  show(): void {
    while (true) {
      console.log(Try<Token, ParseFailure | EOF>(() => this.next()).unwrapOr(err => {
        if (err instanceof ParseFailure) {
          console.error(err.toString())
          return new Failure(1)
        } else if (err instanceof EOF) {
          return null
        }
      }))
    }
  }

  allTokens(): Token[] {
    const ts = []
    while (true) {
      try {
        ts.push(Try<Token, ParseFailure | EOF>(() => this.next()).unwrap())
      } catch (e) {
        if (e instanceof ParseFailure) {
          console.error(e)
          break
        } else if (e instanceof EOF) {
          break
        } else {
          throw e
        }
      }
    }
    return ts
  }

  *iterate(): Generator<Token> {
    while (true) {
      try {
        yield Try<Token, ParseFailure | EOF>(() => this.next()).unwrap()
      } catch (e) {
        if (e instanceof ParseFailure) {
          console.error(e)
          break
        } else if (e instanceof EOF) {
          break
        } else {
          throw e
        }
      }
    }
  }

  /**
   * Resolves the next token, possibly throwing `EOF` (peaceful end of file) or `ParseFailure` (unacceptable lexeme error).
   * Make sure to check at least `EOF` if you do not want an end of file when calling this method.
   */
  next(): Token {
    if (this.ruleSet.skipSpaces) {
      this.skipWhites()
    }

    if (this.sp.eof) {
      throw new EOF()
    }

    // check quoted strings
    for (let quote in this.ruleSet.quotes) {
      if (this.sp.rest.startsWith(quote)) {
        let quotation = this.ruleSet.quotes[quote]
        let s = ''
        const startLine = this.sp.line
        const startColumn = this.sp.column
        this.sp.advance(quote.length)
        while (!this.sp.eof && !this.sp.rest.startsWith(quotation.stop)) {
          if (quotation.escape && eq(this.sp.char, '\\')) {
            // parse escape character
            // \a 7,\b 8,\f 12,\n 10,\r 13,\t 9,\v 11,\\ 92,\' 39,\" 34,\? 63,\0 0,\255 255, \o377 0o377,\xff 0xff,\uffff 0xffff,\w1ffff String.fromCodePoint(0x1ffff)
            this.sp.advance()
            if (this.sp.eof) throw new UnexpectedEOF(this.sp.name)
            switch (this.sp.char) {
              case 'a': s += String.fromCharCode(7); break
              case 'b': s += String.fromCharCode(8); break
              case 'f': s += String.fromCharCode(12); break
              case 'n': s += String.fromCharCode(10); break
              case 'r': s += String.fromCharCode(13); break
              case 't': s += String.fromCharCode(9); break
              case 'v': s += String.fromCharCode(11); break
              case '\\': s += '\\'; break
              case '\'': s += '\''; break
              case '"': s += '"'; break
              case '?': s += '?'; break
              case 'o': case 'O': // \o377
                {
                  let n = ''
                  for (let i = 0; i < 3;) {
                    this.sp.advance()
                    if (this.sp.eof) { // "...\o.EOF
                      throw new UnexpectedEOF(this.sp.name)
                    }
                    if (isOctal(this.sp.char)) {
                      n += this.sp.char
                    } else {
                      throw new ParseFailure('invalid octal escape character', this.sp.name, this.sp.line, this.sp.column)
                    }
                  }
                  s += String.fromCharCode(parseInt(n, 8))
                }
                break
              case 'x': case 'X': // \xff
                {
                  let n = ''
                  for (let i = 0; i < 2;) {
                    this.sp.advance()
                    if (this.sp.eof) { // "...\x.EOF
                      throw new UnexpectedEOF(this.sp.name)
                    }
                    if (isHexadecimal(this.sp.char)) {
                      n += this.sp.char
                    } else {
                      throw new ParseFailure('invalid hexadecimal escape character', this.sp.name, this.sp.line, this.sp.column)
                    }
                  }
                  s += String.fromCharCode(parseInt(n, 16))
                }
                break
              case 'u': case 'U': // \uffff
                {
                  let n = ''
                  for (let i = 0; i < 4;) {
                    this.sp.advance()
                    if (this.sp.eof) { // "...\u.EOF
                      throw new UnexpectedEOF(this.sp.name)
                    }
                    if (isHexadecimal(this.sp.char)) {
                      n += this.sp.char
                    } else {
                      throw new ParseFailure('invalid Unicode-16 escape character', this.sp.name, this.sp.line, this.sp.column)
                    }
                  }
                  s += String.fromCharCode(parseInt(n, 16))
                }
                break
              case 'w': case 'W': // \w10ffff
                {
                  let n = ''
                  for (let i = 0; i < 6;) {
                    this.sp.advance()
                    if (this.sp.eof) { // "...\w.EOF
                      throw new UnexpectedEOF(this.sp.name)
                    }
                    if (isHexadecimal(this.sp.char)) {
                      n += this.sp.char
                    } else {
                      throw new ParseFailure('invalid Unicode-32 escape character', this.sp.name, this.sp.line, this.sp.column)
                    }
                  }
                  this.sp.advance()
                  if (isHexadecimal(this.sp.char)) {
                    n += this.sp.char
                  }
                  s += String.fromCharCode(parseInt(n, 16))
                }
                break
              case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
                {
                  let n = ''
                  for (let i = 1; i < 3; i++) {
                    if (isDigit(this.sp.char)) {
                      n += this.sp.char
                    } else {
                      break
                    }
                    this.sp.advance()
                  }
                  s += String.fromCharCode(parseInt(n, 10))
                }
                break
              default:
                throw new ParseFailure('invalid escape character', this.sp.name, this.sp.line, this.sp.column)
            }
          }
          if (eq(this.sp.char, '\n') && !quotation.multiline) {
            throw new ParseFailure('line break not allowed in this place', this.sp.name, this.sp.line, this.sp.column)
          }
          s += this.sp.char
          this.sp.advance()
        }
        this.sp.advance(quotation.stop.length)
        return new Token(quotation.tokenType, s, this.sp.name, startLine, startColumn)
      }
    }

    let resultToken =
    // a local lambda function to catch `this` and use `return` to control the flow
    (() => {
      // retrieve a word and judge whether it is a static token. this is an attempt to raise performance for well formatted source code.
      let words = this.sp.rest.split(' ', 1)
      if (words.length) {
        let word = words[0]
        let tk = this.ruleSet.staticGuard.get(word)
        if (typeof tk === 'string') {
          const line = this.sp.line
          const column = this.sp.column
          this.sp.advance(word.length)
          return new Token(tk, word, this.sp.name, line, column)
        } else if (tk !== undefined) {
          const line = this.sp.line
          const column = this.sp.column
          this.sp.advance(word.length)
          return tk(new Token('', word, this.sp.name, line, column))
        }
      }

      // check every static rule
      let staticKeys = this.ruleSet.staticGuard.keys()
      for (let iter = staticKeys.next(); !iter.done; iter = staticKeys.next()) {
        let key = iter.value
        if (this.sp.rest.slice(0, key.length) === key) {
          let tk = this.ruleSet.staticGuard.get(key)
          if (typeof tk === 'string') {
            const line = this.sp.line
            const column = this.sp.column
            this.sp.advance(key.length)
            return new Token(tk, key, this.sp.name, line, column)
          } else {
            const line = this.sp.line
            const column = this.sp.column
            this.sp.advance(key.length)
            return tk!(new Token('', key, this.sp.name, line, column))
          }
        }
      }

      // check every dynamic rule
      for (let i in this.ruleSet.dynamicGuard) {
        let guard = this.ruleSet.dynamicGuard[i]
        let m
        if (m = this.sp.rest.match(guard.pat)) {
          if (m !== null) {
            const literal = m[0]
            const line = this.sp.line
            const column = this.sp.column
            this.sp.advance(literal.length)
            if (typeof guard.tk === 'string') {
              return new Token(guard.tk, literal, this.sp.name, line, column)
            } else {
              return guard.tk(new Token('', literal, this.sp.name, line, column))
            }
          }
        }
      }

      throw new ParseFailure(`invalid token`, this.sp.name, this.sp.line, this.sp.column)
    })()

    // check built-in erroneous token types
    if (resultToken.type === TK_NUMBER_NOFOLLOW) {
      throw new ParseFailure(`unexpected '${resultToken.literal}': missing separators between a number and indistinguishable stuff`, this.sp.name, resultToken.line, resultToken.column)
    }

    return resultToken
  }

  /**
   * Make sure to throw custom error in `onEOF` handler, or an `UnexpectedEOF` error will be thrown.
   */
  nextExceptEOF(onEOF?: () => void): Token {
    try {
      return this.next()
    } catch (e) {
      if (e instanceof EOF) {
        onEOF = onEOF || function() {}
        onEOF()
        throw new UnexpectedEOF(this.sp.name)
      }
      throw e
    }
  }

  skipWhites() {
    let lc = this.ruleSet.comment.line
    let nc = this.ruleSet.comment.nested
    let ncLevel = 0
    while (!this.sp.eof) {
      if (ncLevel && nc) {
        if (this.sp.rest.startsWith(nc.begin) && nc.nested) {
          ncLevel++
          this.sp.advance(nc.begin.length)
        } else if (this.sp.rest.startsWith(nc.end)) {
          ncLevel--
          this.sp.advance(nc.end.length)
        } else {
          this.sp.advance()
        }
      } else {
        if (this.sp.char === ' ' || this.sp.char === '\t' || this.sp.char === '\n') {
          this.sp.advance()
        } else if (lc && this.sp.rest.startsWith(lc)) {
          while (!this.sp.eof && this.sp.char !== '\n') {
            this.sp.advance()
          }
        } else if (nc && this.sp.rest.startsWith(nc.begin)) {
          ncLevel++
          this.sp.advance(nc.begin.length)
        } else {
          return
        }
      }
    }
  }

  clone(): Lexer {
    const lexer = new Lexer(this.ruleSet, this.sp.sourceZipper.future, this.sp.name)
    lexer.sp = this.sp.clone()
    return lexer
  }
}

export class Token {
  sourceName: string
  type: string
  literal: string
  line: number
  column: number

  constructor(type: string, literal: string, sourceName: string, line: number, column: number) {
    this.type = type
    this.literal = literal
    this.sourceName = sourceName
    this.line = line
    this.column = column
  }
}

type TokenMapper = (token: Token) => Token

const TK_KEYWORD = '__kw_'
const TK_QUOTED_STRING = '__quoted_by_'
const TK_NUMBER_NOFOLLOW = '__number_nofollow'

// Wording
// "begin" and "end" are used for nested structures (like parentheses), "start" and "stop" are used for unnested structures (like strings).
export class RuleSet {
  skipSpaces: boolean
  staticGuard: Map<string, string | TokenMapper>
  dynamicGuard: { pat: RegExp, tk: string | TokenMapper }[]
  comment: { line?: string, nested?: { begin: string, end: string, nested: boolean } }
  quotes: { [starts: string]: { tokenType: string, stop: string, escape: boolean, multiline: boolean } }
  precedence: {
    static: { [operators: string]: { precedence: number, associativity: 'none' | 'left' | 'right' } },
    dynamic: { pattern: RegExp, precedence: number, associativity: 'none' | 'left' | 'right' }[]
  }

  constructor(
    // defines tokens by patterns
    freeRules: { pattern: string | RegExp, tokenType: string | TokenMapper }[],
    // use presets as shortcut
    presetConfig: {
      // whether to leave out all free whitespaces (not in a string or comment), default `true`
      skipSpaces?: boolean,
      // specifies what starts a line comment (make the rest of the line commented).
      // if line comment has special rules (like that in Haskell), this option should be set undefined.
      lineComment?: string,
      // specifies what begins and ends a block of nested comment.
      nestedComment?:
        string                            /* a unified symbol to start and stop a block comment. e.g. "'''" for Python */
      | string[]                          /* two symbols to begin and end a nested comment. e.g. ['{-', '-}'] for Haskell */
      | {
        begin: string,                    /* symbol to begin a nested comment */
        end: string,                      /* symbol to end a nested comment */
        nested?: boolean                  /* whether the comment is nested */
      },
      // to use common parentheses
      parentheses?: {
        '()'?: boolean,
        '[]'?: boolean,
        '{}'?: boolean
      },
      // to use numbers
      numbers?: {
        // to use integers
        integer?:
          true                            /* default: { hex: true, oct: true, octO: true, bin: true, separator: true, signed: true } */
        | {
          hex?: boolean,                  /* use hexadecimal integer. e.g. 0x123 */
          oct?:                           /* use octal integer. */
            boolean                       /* default: { o: true } */
          | { o?: boolean },              /* whether to use octal "0o" prefix instead of "0". e.g. 0o123 instead of 0123 */
          bin?: boolean,                  /* use binary integer. e.g. 0b1000101001 */
          signed?: boolean                /* use prefix sign. e.g. +1 -1 */
        },
        // to use float pointer numbers
        float?:
          true                            /* default: { exp: true, signed: true } */
        | {
          exp?: boolean,                  /* use exponential part. e.g. 1.0e2 1.0e-2 */
          signed?: boolean                /* use prefix sign. e.g. +1.0 -1.0 */
        },
        separator?: string,               /* numeric separator, default: '_' */
        noFollow?: boolean                /* prevent some token stick to the end of a number. default: true */
        //                                /* default checker: 1e, 1ef, 1a, 0b2, 0o8, 0xg, 0xfg not allowed */
      },
      // specifies how to quotes a string.
      string?:
        string                            /* symbol to quote a string. e.g. '"' for C++ */
      | {
        quotes:
          string                          /* symbol to quote a string. e.g. '"' for C++ */
        | string[]                        /* multiple symbols to quote different kinds of strings. e.g. ["'", '"', '`', '/'] for JavaScript */
        | {[tokenTypes: string]: string  /* multiple symbols to quote different kinds of strings, a tokenType specified for each kind of string.
          //                                e.g. { "'": 'string', '"': 'string', '`': 'string-template', '/': 'regex' } */
          | {
            start: string,                  /* the start symbol of this kind of quoted string. e.g. 'r"' */
            stop: string,                   /* the end symbol of this kind of quoted string. e.g. '"' */
            escape?: boolean,               /* whether escape characters in the string should be parsed. default: true. */
            multiline?: boolean             /* whether the string allows multiline literal. default: false */
            //                              /* e.g. { tokenType: 'python-raw-str', start: 'r"', end: '"', escape: false } */
          }
        }
      },
      // specifies all keywords (reserved identifiers) in the language
      keywords?: (string | RegExp)[],
      // specifies all operators in order of their precedence in the language
      operators?: (
        string | RegExp                   /* operator(s) in its pattern. associativity defaults to 'none'. e.g. '\\^' for C, '+.*' for all operators starts with '+' in Scala */
      | { pattern: string | RegExp, associativity: 'none' | 'left' | 'right' }   /* an operator in its pattern with specified associativity */
      | { pattern: string | RegExp, associativity: 'none' | 'left' | 'right' }[] /* operator(s) in their pattern and in the same precedence, with specified associativity.
      //                                                   e.g. { '+': 'left', '-': 'left' } for C */
      )[]
    }
  ) {
    this.skipSpaces = presetConfig.skipSpaces || true
    this.staticGuard = new Map()
    this.dynamicGuard = []
    this.comment = {
      line: undefined,
      nested: undefined
    }
    this.quotes = {}
    this.precedence = {
      static: {},
      dynamic: []
    }

    for (let i in freeRules) {
      const rule = freeRules[i]
      if (typeof rule.pattern === 'string') {
        this.staticGuard.set(rule.pattern, rule.tokenType)
      } else {
        this.dynamicGuard.push({
          pat: rule.pattern,
          tk: rule.tokenType
        })
      }
    }
    if (presetConfig.parentheses) {
      const paren = presetConfig.parentheses
      if (paren['()']) {
        this.staticGuard.set('(', '(')
        this.staticGuard.set(')', ')')
      }
      if (paren['[]']) {
        this.staticGuard.set('[', '[')
        this.staticGuard.set(']', ']')
      }
      if (paren['{}']) {
        this.staticGuard.set('{', '{')
        this.staticGuard.set('}', '}')
      }
    }
    if (presetConfig.keywords) {
      for (let i in presetConfig.keywords) {
        const keyword = presetConfig.keywords[i]
        if (typeof keyword === 'string') {
          this.staticGuard.set(keyword, TK_KEYWORD + keyword)
        } else {
          this.dynamicGuard.push({
            pat: keyword,
            tk: TK_KEYWORD + keyword
          })
        }
      }
    }
    if (presetConfig.numbers) {
      let noFollow = presetConfig.numbers.noFollow || true

      let sep = presetConfig.numbers.separator === undefined ? '_' : presetConfig.numbers.separator
      if (sep.length !== 1) {
        throw new Error(`lex rule: numeric separator have to be a character, got '${sep}'`)
      }
      if (isHexadecimal(sep)) {
        throw new Error(`lex rule: character 0-9, A-F, a-f is not allowed to be a numeric separator, got '${sep}'`)
      }
      if (sep === '\\' || sep === '-') { sep = '\\' + sep }
      if (presetConfig.numbers.float === undefined) {
      } else if (presetConfig.numbers.float === true) {
        if (noFollow) {
          // number stick to some letters is forbidden. e.g. 1.1a
          this.dynamicGuard.push({
            pat: new RegExp(`^[+\\-]?(\\d[\\d${sep}]*(\\.[\\d${sep}]*)?e[+\\-]?\\d[\\d${sep}]*|\\d[\\d${sep}]*\\.[\\d${sep}]*)([A-DF-Za-df-z]|e[^\\d_+\\-]|e[+\\-][^\\d_])`),
            tk: TK_NUMBER_NOFOLLOW
          })
        }
        this.dynamicGuard.push({
          pat: new RegExp(`^[+\\-]?(\\d[\\d${sep}]*(\\.[\\d${sep}]*)?e[+\\-]?\\d[\\d${sep}]*|\\d[\\d${sep}]*\\.[\\d${sep}]*)`),
          tk: 'float'
        })
      } else {
        const f = presetConfig.numbers.float
        let s = '^'
        if (f.signed) s += '[+\\-]?'
        s += '('
        if (f.exp) s += `\\d[\\d${sep}]*(\\.[\\d${sep}]*)?e[+\\-]?\\d[\\d${sep}]*|`
        s += `\\d[\\d${sep}]*\\.[\\d${sep}]*)`
        if (noFollow) {
          // number stick to some letters is forbidden. e.g. 1.1a, 1.1e, 1.1ea, 1.1e-
          this.dynamicGuard.push({
            pat: new RegExp(`${s}([A-DF-Za-df-z]|e[^\\d_+\\-]|e[+\\-][^\\d_]`),
            tk: TK_NUMBER_NOFOLLOW
          })
        }
        this.dynamicGuard.push({
          pat: new RegExp(s),
          tk: 'float'
        })
      }
      if (presetConfig.numbers.integer === undefined) {
      } else if (presetConfig.numbers.integer === true) {
        if (noFollow) {
          // decimal number stick to some letters is forbidden. e.g. 1a, 0xfg.
          // binary number stick to some non-binary digits is forbidden. e.g. 0b102, 0b2
          // octal number stick to some non-octal number is forbidden. e.g. 0o08, 0o8
          // hexadecimal number stick to some non-hexadecimal characters is forbidden. e.g. 0xfg, 0xg
          this.dynamicGuard.push({
            pat: new RegExp(`^[+\\-]?(0[Bb][^01]|0[Bb][01][01${sep}]*[A-Za-z2-9]|0[Oo][^0-7]|0[Oo][0-7][0-7${sep}]*[A-Za-z89]|0[Xx][^A-Fa-f0-9]|0[Xx][0-9A-Fa-f][0-9A-Fa-f${sep}]*[G-Zg-z]|\\d[\\d${sep}]*[A-Za-z])`),
            tk: TK_NUMBER_NOFOLLOW
          })
        }
        this.dynamicGuard.push({
          pat: new RegExp(`^[+\\-]?(0[Bb][01][01${sep}]*|0[Oo][0-7][0-7${sep}]*|0[Xx][0-9A-Fa-f][0-9A-Fa-f${sep}]*|\\d[\\d${sep}]*)`),
          tk: 'integer'
        })
      } else {
        const i = presetConfig.numbers.integer
        let nof = '^'
        let s = '^'
        if (i.signed) {
          nof += '[+\\-]?'
          s += '[+\\-]?'
        }
        if (i.bin || i.oct || i.hex) {
          nof += '('
          s += '('
          if (i.bin) {
            nof += `0[Bb][^01]|0[Bb][01][01${sep}]*[A-Za-z2-9]|`
            s += `0[Bb][01][01${sep}]*|`
          }
          if (i.oct) {
            nof += `0[Oo][^0-7]|0[Oo][0-7][0-7${sep}]*[A-Za-z89]|`
            s += `0[Oo][0-7][0-7${sep}]*|`
          }
          if (i.hex) {
            nof += `0[Xx][^A-Fa-f0-9]|0[Xx][0-9A-Fa-f][0-9A-Fa-f${sep}]*[G-Zg-z]|`
            s += `0[Xx][0-9A-Fa-f][0-9A-Fa-f${sep}]*|`
          }
          nof += `\\d[\\d${sep}]*[A-Za-z])`
          s += `\\d[\\d${sep}]*)`
        }
        if (noFollow) {
          this.dynamicGuard.push({
            pat: new RegExp(nof),
            tk: TK_NUMBER_NOFOLLOW
          })
        }
        this.dynamicGuard.push({
          pat: new RegExp(s),
          tk: 'integer'
        })
      }
    }
    if (presetConfig.string) {
      if (typeof presetConfig.string === 'string') {
        let quote = presetConfig.string
        this.quotes[quote] = {
          tokenType: TK_QUOTED_STRING + quote,
          stop: quote,
          escape: true,
          multiline: false
        }
      } else {
        let quotes = presetConfig.string.quotes
        if (typeof quotes === 'string') {
          this.quotes[quotes] = {
            tokenType: TK_QUOTED_STRING + quotes,
            stop: quotes,
            escape: true,
            multiline: false
          }
        } else if (quotes instanceof Array) {
          if (quotes.length === 1) {
            let quote = quotes[0]
            this.quotes[quote] = {
              tokenType: TK_QUOTED_STRING + quote,
              stop: quote,
              escape: true,
              multiline: false
            }
          } else if (quotes.length >= 2) {
            let [start, stop] = quotes
            this.quotes[start] = {
              tokenType: TK_QUOTED_STRING + start + stop,
              stop,
              escape: true,
              multiline: false
            }
          } else {
            throw new RangeError('lexer rule: quotes: expected at least 1 element for input type of Array')
          }
        } else {
          for (let tokenType in quotes) {
            let quote = quotes[tokenType]
            if (typeof quote === 'string') {
              this.quotes[quote] = {
                tokenType,
                stop: quote,
                escape: true,
                multiline: false
              }
            } else {
              this.quotes[quote.start] = {
                tokenType,
                stop: quote.stop,
                escape: quote.escape === undefined ? true : quote.escape,
                multiline: quote.multiline === undefined ? false : quote.multiline
              }
            }
          }
        }
      }
    }
    if (presetConfig.operators) {
      let highest = presetConfig.operators.length - 1
      for (let i = highest; i >= 0; i--) {
        let op = presetConfig.operators[i]
        if (typeof op === 'string') {
          this.precedence.static[op] = {
            precedence: i,
            associativity: 'none'
          }
        } else if (op instanceof RegExp) {
          this.precedence.dynamic.push({
            pattern: op,
            precedence: i,
            associativity: 'none'
          })
        } else if (op instanceof Array) {
          for (let j in op) {
            let o = op[j]
            if (typeof o.pattern === 'string') {
              this.precedence.static[o.pattern] = {
                precedence: i,
                associativity: o.associativity
              }
            } else {
              this.precedence.dynamic.push({
                pattern: o.pattern,
                precedence: i,
                associativity: o.associativity
              })
            }
          }
        } else {
          if (typeof op.pattern === 'string') {
            this.precedence.static[op.pattern] = {
              precedence: i,
              associativity: op.associativity
            }
          } else {
            this.precedence.dynamic.push({
              pattern: op.pattern,
              precedence: i,
              associativity: op.associativity
            })
          }
        }
      }
    }

    // comments are processed in tokenizing, registered here
    if (presetConfig.lineComment) {
      this.comment.line = presetConfig.lineComment
    }
    if (presetConfig.nestedComment) {
      const nc = presetConfig.nestedComment
      if (typeof nc === 'string') {
        this.comment.nested = {
          begin: nc,
          end: nc,
          nested: false
        }
      } else if (nc instanceof Array) {
        let bg = '', ed = ''
        if (nc.length === 1) {
          bg = ed = nc[0]
        } else if (nc.length >= 2) {
          bg = nc[0]
          ed = nc[1]
        } else {
          throw new RangeError('lexer rule: nestedComment: expected at least 1 element for input type of Array')
        }
        this.comment.nested = {
          begin: bg,
          end: ed,
          nested: true
        }
      } else {
        this.comment.nested = {
          begin: nc.begin,
          end: nc.end,
          nested: nc.nested === undefined ? true : nc.nested
        }
      }
    }
  }
}

function cleanCRLF(str: string): string {
  let chs = str.split('')
  for (let i = 0; i < chs.length;) {
    if (chs[i] === '\r') {
      chs.splice(i, 1)
    } else {
      i++
    }
  }
  return chs.join('')
}

export class SourcePosition {
  /* history is not used currently */
  name: string
  sourceZipper: { history: string, future: string }
  line: number
  column: number

  constructor(source: string, name?: string) {
    this.name = name || ''
    source = cleanCRLF(source)
    this.sourceZipper = {
      history: '',
      future: source
    }
    this.line = 1
    this.column = 1
  }

  get rest() {
    return this.sourceZipper.future
  }

  advance(step: number = 1) {
    for (let i = 0; i < step; i++) {
      this._step()
    }
  }

  private _step() {
    if (this.eof) {
      throw new UnexpectedEOF(this.name)
    }
    if (this.char === '\r') {
    }
    if (this.char === '\n') {
      this.line++
      this.column = 0
    }
    this.sourceZipper.future = this.sourceZipper.future.slice(1)
    this.column++
  }

  get eof(): boolean {
    return this.sourceZipper.future.length === 0
  }

  get char(): string {
    if (this.eof) {
      throw new RangeError('lexer: getting char while EOF')
    }
    return this.sourceZipper.future[0]
  }

  clone(): SourcePosition {
    const sp = new SourcePosition(this.sourceZipper.future, this.name)
    sp.line = this.line
    sp.column = this.column
    return sp
  }

  compareTo(other: SourcePosition): 'forward' | 'equal' | 'behind' | 'irrelevant' {
    if (this.sourceZipper.future === other.sourceZipper.future && this.line === other.line && this.column === other.column && this.name === other.name) {
      return 'equal'
    } else if (this.name === other.name && this.sourceZipper.future.indexOf(other.sourceZipper.future) > -1) {
      return 'behind'
    } else if (this.name === other.name && other.sourceZipper.future.indexOf(this.sourceZipper.future) > -1) {
      return 'forward'
    } else {
      return 'irrelevant'
    }
  }

  assign(other: SourcePosition): ThisType<SourcePosition> {
    this.name = other.name
    this.sourceZipper.history = other.sourceZipper.history
    this.sourceZipper.future = other.sourceZipper.future
    this.line = other.line
    this.column = other.column
    return this
  }
}

// JavaScript can safely represent integer between -2^53(-9007199254740992) and 2^53(9007199254740992)
// But bitwise shift can only happen under -2^31 to 2^31 - 1. Actually, JavaScript << and >> operators
// cut off the integer to its lower 32 bit and shift with the sign of 32-bit integer (ROL and ROR).
// For integer bigger than 32-bit, use JSBI instead.
export type SafeInt = Int32 | JSBI

export class Int32 {
  value: number

  private constructor() {
    this.value = 0
  }

  /**
   * @param value Required a valid 32-bit integer. Use `Int32.cast` to cast the number first if you are not sure. Or use `Int32.test` to make decisions yourself.
   */
  static take(value: number): Int32 {
    if (Int32.test(value)) {
      let i = new Int32()
      i.value = value
      return i
    } else {
      throw new Error(`value ${value} is not a valid 32-bit integer`)
    }
  }

  static test(value: number): boolean {
    return value >> 0 !== value
  }

  static cast(value: number): number {
    return value >> 0
  }
}

/**
 * Given '-64', '-0x40', '-0o100', '-0b01000000', will produce -64, -64, -64, -64.
 * @param octalPrefix0 Whether to process numbers starting with 0 as octal numbers (default processing 0o... octal numbers).
 */
export function parseInt32Safe(token: Token, octalPrefix0: boolean): number {
  const literal = token.literal
  if ((octalPrefix0 && (literal.startsWith('0') && literal.length > 1 || literal.startsWith('-0') && literal.length > 2)) || // 0123 -0123
    literal.startsWith('0o') || literal.startsWith('-0o'))  // 0o123 -0o123
  {
    let digits
    if (literal.startsWith('-0o')) {
      digits = literal.slice(3)
    } else if (literal.startsWith('0o') || literal.startsWith('-0')) {
      digits = literal.slice(2)
    } else {
      digits = literal.slice(1)
    }
    if (digits.length > 11) {
      throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
    } else {
      let value = parseInt(digits, 8)
      if (value > 0xffffffff) {
        throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
      }
      return literal[0] === '-' ? -value : value
    }
  } else if (literal.startsWith('0b') || literal.startsWith('-0b')) {
    let digits
    if (literal[0] === '-') {
      digits = literal.slice(3)
    } else {
      digits = literal.slice(2)
    }
    if (digits.length > 32) {
      throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
    }
    return parseInt(digits, 2) * (literal[0] === '-' ? -1 : 1)
  }
  return parseInt(literal)
}

export function parseSafeInt(token: Token, octalPrefix0: boolean): SafeInt {
    const literal = token.literal
  if ((octalPrefix0 && (literal.startsWith('0') && literal.length > 1 || literal.startsWith('-0') && literal.length > 2)) || // 0123 -0123
    literal.startsWith('0o') || literal.startsWith('-0o'))  // 0o123 -0o123
  {
    let digits
    if (literal.startsWith('-0o')) {
      digits = literal.slice(3)
    } else if (literal.startsWith('0o') || literal.startsWith('-0')) {
      digits = literal.slice(2)
    } else {
      digits = literal.slice(1)
    }
    if (digits.length > 11) {
      console.warn('warning: JSBI.BigInt is not tested to ensure safety for \'0o\' octal literals')
      return JSBI.BigInt(literal)
      // throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
    } else {
      let value = parseInt(digits, 8)
      if (value > 0xffffffff) {
        return JSBI.BigInt(value)
        // throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
      }
      return literal[0] === '-' ? Int32.take(-value) : Int32.take(value)
    }
  } else if (literal.startsWith('0b') || literal.startsWith('-0b')) {
    let digits
    if (literal[0] === '-') {
      digits = literal.slice(3)
    } else {
      digits = literal.slice(2)
    }
    if (digits.length > 32) {
      console.warn('warning: JSBI.BigInt is not tested to ensure safety for \'0b\' binary literals')
      return JSBI.BigInt(literal)
      // throw new ParseFailure(`invalid 32-bit integer ${literal}`, token.sourceName, token.line, token.column)
    }
    return Int32.take(parseInt(digits, 2) * (literal[0] === '-' ? -1 : 1))
  }
  return Int32.take(parseInt(literal))
}
