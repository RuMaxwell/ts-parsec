class EOF {
  toString() {
    return 'lexeme error: unexpected EOF'
  }
}

// avoid type check for a === b
function eq(a: any, b: any): boolean {
  return a === b
}

function isDigit(x: string): boolean {
  return x.charCodeAt(0) >= '0'.charCodeAt(0) && x.charCodeAt(0) <= '9'.charCodeAt(0)
}

export class Lexer {
  ruleSet: RuleSet
  sp: SourcePosition

  constructor(ruleSet: RuleSet, source: string) {
    this.ruleSet = ruleSet
    this.sp = new SourcePosition(source)
  }

  // throws tokenizing errors
  next(): Token | 'eof' {
    this.skipWhites()

    if (this.sp.eof) {
      return 'eof'
    }

    // check quoted strings
    for (let quote in this.ruleSet.quotes) {
      if (this.sp.rest.startsWith(quote)) {
        let quotation = this.ruleSet.quotes[quote]
        let s = ''
        this.sp.advance(quote.length)
        while (!this.sp.eof && !this.sp.rest.startsWith(quotation.stop)) {
          if (quotation.escape && eq(this.sp.char, '\\')) {
            // parse escape character
            // \a 7,\b 8,\f 12,\n 10,\r 13,\t 9,\v 11,\\ 92,\' 39,\" 34,\? 63,\0 0,\ddd 0oddd,\xhh 0xhh
            this.sp.advance()
            if (this.sp.eof) throw new EOF()
            switch (this.sp.char) {
              case 'a': s += '\a'; break
              case 'b': s += '\b'; break
              case 'f': s += '\f'; break
              case 'n': s += '\n'; break
              case 'r': s += '\r'; break
              case 't': s += '\t'; break
              case 'v': s += '\v'; break
              case '\\': s += '\\'; break
              case '\'': s += '\''; break
              case '"': s += '"'; break
              case '?': s += '?'; break
              case 'x':
                // TODO:
                break
              default:
                if (isDigit(this.sp.char)) {
                  // TODO:
                }
            }
          }
          this.sp.advance()
        }
      }
    }

    // retrieve a word and judge whether it is a static token. this is an attempt to raise performance for well formatted source code.
    let words = this.sp.rest.split(' ', 1)
    if (words.length) {
      let word = words[0]
      let tk = this.ruleSet.staticGuard.get(word)
      if (typeof tk === 'string') {
        const line = this.sp.line
        const column = this.sp.column
        this.sp.advance(word.length)
        return new Token(tk, word, line, column)
      } else if (tk !== undefined) {
        const line = this.sp.line
        const column = this.sp.column
        this.sp.advance(word.length)
        return tk(new Token('', word, line, column))
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
          return new Token(tk, key, line, column)
        } else if (tk !== undefined) {
          const line = this.sp.line
          const column = this.sp.column
          this.sp.advance(key.length)
          return tk(new Token('', key, line, column))
        } else {
          throw 'impossible'
        }
      }
    }

    // check every dynamic rule
    for (let i in this.ruleSet.dynamicGuard) {
      let guard = this.ruleSet.dynamicGuard[i]
      if (this.sp.rest.)
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
}

class Token {
  type: string
  literal: string
  line: number
  column: number

  constructor(type: string, literal: string, line: number, column: number) {
    this.type = type
    this.literal = literal
    this.line = line
    this.column = column
  }
}

type TokenMapper = (token: Token) => Token

const TK_KEYWORD = '__kw'
const TK_QUOTED_STRING = '__quoted_by'

// Wording
// "begin" and "end" are used for nested structures (like parentheses), "start" and "stop" are used for unnested structures (like strings).
export class RuleSet {
  staticGuard: Map<string, string | TokenMapper>
  dynamicGuard: { pat: RegExp, tk: string | TokenMapper }[]
  comment: { line?: string, nested?: { begin: string, end: string, nested: boolean } }
  quotes: { [starts: string]: { tokenType: string, stop: string, escape: boolean } }
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
            tokenType: string,              /* specifies the tokenType of this kind of quoted string. e.g. 'python-raw-str' */
            start: string,                  /* specifies the start symbol of this kind of quoted string. e.g. 'r"' */
            stop: string,                   /* specifies the end symbol of this kind of quoted string. e.g. '"' */
            escape?: boolean                /* defines whether escape characters in the string should be parsed. default: true. */
            //                              /* e.g. { tokenType: 'python-raw-str', start: 'r"', end: '"', escape: false } */
          }
        }
      },
      // specifies all keywords (reserved identifiers) in the language
      keywords?: (string | RegExp)[],
      // specifies all operators in order of their precedence in the language
      operators?: (
        string | RegExp                   /* operator(s) in its pattern. associativity defaults to 'none'. e.g. '\\^' for C, '+.*' for all operators starts with '+' in Scala */
      | { pattern: string | RegExp, associativity: 'none' | 'left' | 'right' }[] /* operator(s) in its pattern and in the same precedence, with specified associativity.
      //                                                   e.g. { '+': 'left', '-': 'left' } for C */
      )[]
    }
  ) {
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
    if (presetConfig.keywords) {
      for (let keyword in presetConfig.keywords) {
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
    if (presetConfig.string) {
      if (typeof presetConfig.string === 'string') {
        let quote = presetConfig.string
        this.quotes[quote] = {
          tokenType: TK_QUOTED_STRING + quote,
          stop: quote,
          escape: true
        }
      } else {
        let quotes = presetConfig.string.quotes
        if (typeof quotes === 'string') {
          this.quotes[quotes] = {
            tokenType: TK_QUOTED_STRING + quotes,
            stop: quotes,
            escape: true
          }
        } else if (quotes instanceof Array) {
          if (quotes.length === 1) {
            let quote = quotes[0]
            this.quotes[quote] = {
              tokenType: TK_QUOTED_STRING + quote,
              stop: quote,
              escape: true
            }
          } else if (quotes.length >= 2) {
            let [start, stop] = quotes
            this.quotes[start] = {
              tokenType: TK_QUOTED_STRING + start + stop,
              stop,
              escape: true
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
                escape: true
              }
            } else {
              this.quotes[quote.start] = {
                tokenType,
                stop: quote.stop,
                escape: quote.escape === undefined ? true : quote.escape
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
        } else {
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

class SourcePosition {
  /* history is not used currently */
  sourceZipper: { history: string, future: string }
  line: number
  column: number

  constructor(source: string) {
    source = cleanCRLF(source)
    this.sourceZipper = {
      history: '',
      future: source
    }
    this.line = 1
    this.column = 0
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
      throw new RangeError('lexer: advance while EOF')
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
}
