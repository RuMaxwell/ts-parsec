import { test } from './syntax-rules'

test.aOrb().parse(test.lexer)
  .then(x => console.log(x))
  .catch(e => console.error(e.toString()))
