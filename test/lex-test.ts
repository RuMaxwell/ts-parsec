import { RuleSet, Lexer } from '../src/lex'

function LexTest() {
  const identifierPattern = /^[A-Za-z\-][A-Za-z0-9\-]/
  const builtInPattern = new RegExp('/' + /^[A-Za-z\-][A-Za-z0-9\-]/ + '/')

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
}
