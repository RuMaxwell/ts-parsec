import { json } from './syntax-rules'

json.start().show(json.lexer)

// json.start().parse(json.lexer)
//   .then(x => {
//     console.log(x)
//     try {
//       json.lexer.next()
//     } catch (e) {
//       if (!(e instanceof EOF)) {
//         console.warn('warning: not consuming all input')
//       }
//     }
//   })
//   .catch(e => console.error(e.toString()))
