import { RuleSet } from '../src/lex'

export const noShift = (function() {
  const identifierPattern = /^[A-Za-z][A-Za-z0-9\-]*/
  const builtInPattern = new RegExp('^/[A-Za-z][A-Za-z0-9\\-]*/')

  const ruleSet = new RuleSet(
    // free rules
    [
      { pattern: identifierPattern, tokenType: 'identifier' }, // string | (token: Token) => Token
      { pattern: builtInPattern, tokenType: 'builtin' },
      { pattern: ',', tokenType: ',' }
    ],
    // config preset rules
    {
      skipSpaces: true,
      lineComment: '//',
      nestedComment: ['/*', '*/'],
      parentheses: {
        '[]': true
      },
      // use default numbers
      numbers: {
        integer: true,
        float: true
      },
      // use double quoted strings
      string: {
        // quotes: string / array / object
        quotes: {
          'string': '"',  // equal to { start: '"', stop: '"', escape: true, tokenType: 'string' }
          'char': '\'',
          'raw': { start: 'r"', stop: '"', escape: false, multiline: true },
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

  return ruleSet
})()

export const jssa = (function() {
  const ruleSet = new RuleSet(
    [
      { pattern: /^[_A-Za-z0-9\-:@$.#]+/, tokenType: 'attribute' },
      { pattern: '=', tokenType: '=' },
      { pattern: ';', tokenType: ';' },
    ], {
      skipSpaces: true,
      string: {
        quotes: {
          'string"': '"',
          "string'": "'",
          '()': {
            start: '(',
            stop: ')',
            escape: false,
            multiline: true
          }
        }
      },
      parentheses: {
        '{}': true,
      },
    }
  )

  return ruleSet
})()

export const json = (function() {
  const ruleSet = new RuleSet(
    [
      { pattern: '{', tokenType: '{' },
      { pattern: '}', tokenType: '}' },
      { pattern: '[', tokenType: '[' },
      { pattern: ']', tokenType: ']' },
      { pattern: ':', tokenType: ':' },
      { pattern: ',', tokenType: ',' },
      { pattern: 'true', tokenType: 'boolean' },
      { pattern: 'false', tokenType: 'boolean' },
      { pattern: 'null', tokenType: 'null' },
    ],
    {
      skipSpaces: true,
      string: {
        quotes: {
          string: '"'
        }
      },
      numbers: {
        integer: true,
        float: true,
      }
    }
  )

  return ruleSet
})()

export const test = (function() {
  const ruleSet = new RuleSet(
    [
      { pattern: /^true(?![A-Za-z_0-9])/, tokenType: 'boolean' },
      { pattern: /^false(?![A-Za-z_0-9])/, tokenType: 'boolean' },
      { pattern: /^null(?![A-Za-z_0-9])/, tokenType: 'null' },
      { pattern: /^if(?![A-Za-z_0-9])/, tokenType: 'if' },
      { pattern: /^else(?![A-Za-z_0-9])/, tokenType: 'else' },
      { pattern: /^[A-Za-z_][A-Za-z_0-9]*/, tokenType: 'id' },
      { pattern: '{', tokenType: '{' },
      { pattern: '}', tokenType: '}' },
      { pattern: ',', tokenType: ',' },
      { pattern: ';', tokenType: ';' },
    ],
    {
      skipSpaces: true,
      string: {
        quotes: {
          string: '"'
        }
      },
      numbers: {
        integer: true,
        float: true,
      }
    }
  )

  return ruleSet
})()
