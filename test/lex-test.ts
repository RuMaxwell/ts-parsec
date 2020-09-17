import langs from './rules'
import srcs from './testsrcs'
import { Lexer } from '../src/lex'

export function LexTest() {
  // var lexer = new Lexer(langs['no-shift'], srcs['no-shift'])
  // lexer.show()

  var lexer = new Lexer(langs['jssa'], srcs['jssa'])
  lexer.show()
}
