import { test } from './syntax-rules'

test.ints().parse(test.lexer).then(x => console.log(x)).catch(e => console.error(e.toString()))
