import * as srcs from './testsrcs'
import * as rules from './lex-rules'
import { Lexer } from '../src/lex'

export function LexTest() {
  var lexer = new Lexer(rules.json, srcs.json, 'test.json')
  lexer.show()
}
