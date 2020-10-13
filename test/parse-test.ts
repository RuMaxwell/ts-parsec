import { test } from './syntax-rules'

test.start().parse(test.lexer)
  .then(x => {
    console.log(x)
    if (!test.lexer.sp.eof) {
      console.warn('warning: not consuming all input')
    }
  })
  .catch(e => console.error(e.toString()))
