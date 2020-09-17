import { Lexer } from "../src/lex";
import { Syntax, r, n, sel } from "../src/parse";
import rules from "./rules";
import testsrcs from "./testsrcs";

export function ParseTest() {
  const lexer = new Lexer(rules['jssa'], testsrcs['jssa'])

  const syntax = new Syntax({
    start: 'node',
    tokenPrecedence: lexer.ruleSet.precedence,
    productions: {
      'node': r('attribute', 'name')
        .zom(r('attribute', 'attrName').r('=').sel([r('string"'), r("string'"), r('()')], 'attrValue'))
        .sel([
          r(';'),
          sel([r('string"'), r("string'"), r('()')]),
          r('{')
            .zom(n('node'))
          .r('}')
        ], 'subNodes')
    }
  })
}

/*
node = attribute[name] attrs ({ node* } | ; | STRING[subtext]) | STRING[text]
attrs = (attribute[name] = STRING[value])*
 */
