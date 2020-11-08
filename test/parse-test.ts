import { expr, json, test } from './syntax-rules'

export function ParseTest() {
  // json.start().show(json.lexer)
  expr.start().show(test.lexer)
}
