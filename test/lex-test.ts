import '../src/lex'

function LexTest() {
  const identifierPattern = /[A-Za-z\-][A-Za-z0-9\-]/
  const builtInPattern = '/' + identifierPattern + '/'
  const charPattern = ''

  const lexRules = new RuleSet(
    // free rules
    {
      identifierPattern: 'identifier', // string | (token: Token) => Token
      builtInPattern: 'builtin',
    },
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
        { '/pow/': 'right' },
        { '/mul/': 'left', '/div/': 'left' },
        { '/add/': 'left', '/sub/': 'left' },
      ]
    }
  )
}
