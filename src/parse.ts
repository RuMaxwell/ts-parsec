export class Syntax {
  constructor(definition: {
    // entrance nonterminal
    start: string,
    // token-level precedence defined by lexer's ruleSet
    tokenPrecedence: {
      static: { [operators: string]: { precedence: number, associativity: 'none' | 'left' | 'right' } },
      dynamic: { pattern: RegExp, precedence: number, associativity: 'none' | 'left' | 'right' }[]
    },
    // production rules
    productions: { [nonterms: string]: Product }
  }) {
  }
}

// rhs of a production rule
class Product {
  /** required TOKEN */
  r(tokenType: string, ref?: string): Product {
  }
  /** required nonterminal */
  n(nonterm: string, ref?: string): Product {
  }
  /** option sentence? */
  opt(sentence: Product, ref?: string): Product {
  }
  /** one or more sentence+ */
  more(sentence: Product, ref?: string): Product {
  }
  /** zero or more sentence* */
  zom(sentence: Product, ref?: string): Product {
    return this.opt(more(sentence), ref)
  }
  /** selection (sentence|sentence|sentence) */
  sel(options: Product[], ref?: string): Product {
  }
}

/** required <token> */
export function r(tokenType: string, ref?: string): Product {
}

export function n(nonterm: string, ref?: string): Product {
}

/** option sentence? */
export function opt(sentence: Product, ref?: string): Product {
}
/** one or more sentence+ */
export function more(sentence: Product, ref?: string): Product {
}
/** zero or more sentence* */
export function zom(sentence: Product, ref?: string): Product {
  return opt(more(sentence), ref)
}

export function sel(options: Product[], ref?: string): Product {
}
