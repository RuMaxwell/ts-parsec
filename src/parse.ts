import { Lexer, Token } from "./lex"

export class SyntaxDefinitionError {
  msg: string

  constructor(msg?: any) {
    this.msg = msg ?? ''
  }

  toString() {
    return `error in syntax definition` + (this.msg ? `: ${this.msg}` : '')
  }
}

export class SyntaxError {
  msg: string
  line?: number
  column?: number
  token?: Token

  constructor(msg?: any, line?: number, column?: number, token?: Token) {
    this.msg = `${msg}` ?? ''
    this.line = line
    this.column = column
    this.token = token
  }

  toString() {
    return `syntax error` + (this.msg ? `: ${this.msg}` : '') +
      (this.line ? `at line ${this.line}` : '') +
      (this.column ? `, column ${this.column}` : '') +
      (this.token ? ` => '${this.token.literal}'` : '')
  }
}

export class Syntax {
  startSymbol: string
  productions: { [names: string]: Product }

  constructor(definition: {
    // entrance nonterminal
    start: string,
    // token-level precedence defined by lexer's ruleSet
    tokenPrecedence: {
      static: { [operators: string]: { precedence: number, associativity: 'none' | 'left' | 'right' } },
      dynamic: { pattern: RegExp, precedence: number, associativity: 'none' | 'left' | 'right' }[]
    },
    // production rules
    productions: { [names: string]: Product }
  }) {
    this.startSymbol = definition.start
    this.productions = definition.productions
    // globalization
    for (let name in definition.productions) {
      let production = definition.productions[name]
      for (let sub in production.nonterminals) {
        if (this.productions[sub]) {
          console.error(`warning: duplicated symbol name: ${sub}, the former is replaced with the latter`)
        }
        this.productions[sub] = production.nonterminals[sub]
      }
    }
  }

  parse(lexer: Lexer, def: SyntaxDef): AST {
    def = def!
    if (false) {
    } else if ('tokenType' in def) {
      return new TokenParser(this, def.tokenType, def.ref, def.next)
    } else if ('nonterm' in def) {
      return new NontermParser(this, def.nonterm, def.ref, def.next)
    } else if (def instanceof Array) {
      return new AlternativeParser(this, def)
    }
  }
}

class TokenParser {
  syntax: Syntax
  tokenType: string
  ref?: string
  next?: SyntaxDef

  constructor(syntax: Syntax, tokenType: string, ref?: string, next?: SyntaxDef) {
    this.syntax = syntax
    this.tokenType = tokenType
    this.ref = ref
    this.next = next
  }

  parse(lexer: Lexer): AST {
    let token = lexer.next()
    if (token.type !== this.tokenType) {
      throw new SyntaxError(`unexpected ${token.type}, expected ${this.tokenType}`, token.line, token.column, token)
    }
    return {
      token,
      next: this.next ? this.syntax.parse(lexer, this.next) : undefined
    }
  }
}

class NontermParser {
  syntax: Syntax
  name: string
  ref?: string
  next?: SyntaxDef

  constructor(syntax: Syntax, name: string, ref?: string, next?: SyntaxDef) {
    this.syntax = syntax
    this.name = name
    this.ref = ref
    this.next = next
  }

  parse(lexer: Lexer): AST {
    let product = this.syntax.productions[this.name]
    if (!product) {
      throw new SyntaxDefinitionError(`referencing undefined symbol '${this.name}'`)
    }
    let ast = this.syntax.parse(lexer, product.ast)
    ast.next = this.next ? this.syntax.parse(lexer, this.next) : undefined
  }
}

class AlternativeParser {
  syntax: Syntax
  alters: SyntaxDef[]
  ref?: string
  next?: SyntaxDef

  constructor(syntax: Syntax, alters: SyntaxDef[] & { ref?: string, next?: SyntaxDef }) {
    this.syntax = syntax
    this.alters = alters
    this.ref = alters.ref
    this.next = alters.next
  }

  parse(): undefined
}

type SyntaxDef = (({ tokenType: string } | { nonterm: string } | SyntaxDef[]) & { ref?: string, next?: SyntaxDef }) | null

// rhs of a production rule (aka. the definition of nonterminal)
class Product {
  static uniqueName(): string {
    return `_symbol_${new Date().getTime()}`
  }

  ast: SyntaxDef = null
  // sub-syntax structures
  nonterminals: { [names: string]: Product } = {}

  constructor() {
  }

  /** required TOKEN */
  r(tokenType: string, ref?: string): Product {
    if (this.ast) {
      this.ast.next = { tokenType, ref }
    } else {
      this.ast = { tokenType, ref }
    }
    return this
  }
  /** required nonterminal */
  n(nonterm: string, ref?: string): Product {
    if (this.ast) {
      this.ast.next = { nonterm, ref }
    } else {
      this.ast = { nonterm, ref }
    }
    return this
  }
  /** any successor AST */
  s(successor: SyntaxDef, ref?: string): Product {
    if (this.ast) {
      this.ast.next = successor
      this.ast.next!.ref = ref
    } else {
      this.ast = successor
      this.ast!.ref = ref
    }
    return this
  }
  /** option - sentence? */
  opt(sentence: Product, ref?: string): Product {
    if (this.ast) {
      this.ast.next = [sentence.ast, null]
      this.ast.next.ref = ref
    } else {
      this.ast = [sentence.ast, null]
      this.ast.ref = ref
    }
    return this
  }
  /** one or more - sentence+ */
  more(sentence: Product, ref?: string): Product {
    const name = ref ?? Product.uniqueName()
    const product = sel([
      n(name).s(sentence.ast),
      s(sentence.ast)
    ], ref)
    this.nonterminals[name] = product
    if (this.ast) {
      this.ast.next = product.ast
    } else {
      this.ast = product.ast
    }
    return this
  }
  /** zero or more - sentence* */
  many(sentence: Product, ref?: string): Product {
    return this.opt(more(sentence), ref)
  }
  /** selection - (sentence|sentence|sentence) */
  sel(options: Product[], ref?: string): Product {
    if (this.ast) {
      this.ast.next = options.map(o => o.ast)
      this.ast.next.ref = ref
    } else {
      this.ast = options.map(o => o.ast)
      this.ast.ref = ref
    }
    return this
  }
}

/** required TOKEN */
export function r(tokenType: string, ref?: string): Product {
  return new Product().r(tokenType, ref)
}

/** required nonterminal */
export function n(nonterm: string, ref?: string): Product {
  return new Product().n(nonterm, ref)
}

/** any successor AST */
export function s(successor: SyntaxDef, ref?: string): Product {
  return new Product().s(successor, ref)
}

/** option sentence? */
export function opt(sentence: Product, ref?: string): Product {
  return new Product().opt(sentence, ref)
}
/** one or more sentence+ */
export function more(sentence: Product, ref?: string): Product {
  return new Product().more(sentence, ref)
}
/** zero or more sentence* */
export function many(sentence: Product, ref?: string): Product {
  return new Product().many(sentence, ref)
}

export function sel(options: Product[], ref?: string): Product {
  return new Product().sel(options, ref)
}
