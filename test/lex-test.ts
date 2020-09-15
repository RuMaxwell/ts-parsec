import { RuleSet, Lexer, Token, ParseFailure, EOF } from '../src/lex'
import { Failure, Try } from '../src/catcher'
import fs from 'fs'
import pathlib from 'path'

export function LexTest() {
  const path = pathlib.resolve('./test/lex-test-src.nos')
  const source = fs.readFileSync(path).toString()

  const identifierPattern = /^[A-Za-z][A-Za-z0-9\-]*/
  const builtInPattern = new RegExp('/' + /^[A-Za-z\-][A-Za-z0-9\-]*/ + '/')

  const lexRules = new RuleSet(
    // free rules
    [
      { pattern: identifierPattern, tokenType: 'identifier' }, // string | (token: Token) => Token
      { pattern: builtInPattern, tokenType: 'builtin' }
    ],
    // config preset rules
    {
      skipSpaces: true,
      lineComment: '//',
      nestedComment: ['/*', '*/'],
      // use double quoted strings
      string: {
        // quotes: string / array / object
        quotes: {
          'string': '"',  // equal to { start: '"', stop: '"', escape: true, tokenType: 'string' }
          'char': '\'',
          'raw': { start: 'r"', stop: '"', escape: false, tokenType: 'raw' },
        }
      },
      // context-free keywords
      keywords: [
        'char',
        'define',
        'include',
        'int',
        'fn',
        'ptr',
        'ref',
        'str',
        'typedef',
        'var',
      ],
      // operators with precedence higher->lower
      operators: [
        { pattern: '/pow/', associativity: 'right' },
        [{ pattern: '/mul/', associativity: 'left' }, { pattern: '/div/', associativity: 'left' }],
        [{ pattern: '/add/', associativity: 'left'}, { pattern: '/sub/', associativity: 'left' }],
      ]
    }
  )

  const lexer = new Lexer(lexRules, source)

  while (true) {
    console.log(Try<Token, ParseFailure | EOF>(() => lexer.next()).unwrapOr(err => {
      if (err instanceof ParseFailure) {
        console.error(err.toString())
        return new Failure(1)
      } else if (err instanceof EOF) {
        return null
      }
    }))
  }
}
