type LexHandler = (tp: TokenPosition) => __EXPECTED__

class Lexer {
  constructor(rules: Map<string | RegExp, LexHandler>) {
  }
}

type TokenMapper = (token: Token) => Token

// Wording
// "begin" and "end" are used for nested structures (like parentheses), "start" and "stop" are used for unnested structures (like strings).

class RuleSet {
  constructor(
    freeRules: {[patterns: string]: string | TokenMapper},
    presetConfig: {
      // whether to leave out all free whitespaces (not in a string or comment), default `true`
      skipSpaces?: boolean,
      // Specifies what starts a line comment (make the rest of the line commented).
      // If line comment has special rules (like those in Haskell), this option should be set undefined.
      lineComment?: string,
      // Specifies what begins and ends a block of nested comment.
      nestedComment?: string | string[] | {
        begin: string,
        end: string,
        nested?: boolean
      },
      string: string | {
        quotes: string | string[] | {[tokenTypes: string]: string | {
          tokenType: string,
          start: string,
          stop: string,
          escape: boolean
        }}
      },
      keywords: string[],
      operators: (
        string |
        {[pattern: string]: 'none' | 'left' | 'right' }
      )[]
    }
  ) {
  }
}
