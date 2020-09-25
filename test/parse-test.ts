import { Lexer } from "../src/lex";
import { Syntax, r, n, sel, produce } from "../src/parse";
import rules from "./rules";
import testsrcs from "./testsrcs";

export function ParseTest() {
  const lexer = new Lexer(rules['jssa'], testsrcs['jssa'])

  const syntax = new Syntax({
    start: 'node',
    tokenPrecedence: lexer.ruleSet.precedence,
    productions: {
      'node':
        r('attribute', 'name')
        .many(
          r('attribute', 'attr.name').r('=').sel([r('string"'), r("string'"), r('()')], 'attr.value')
        )
        .sel(
          [
            r(';', 'sub.nil'),
            sel([r('string"'), r("string'"), r('()')], 'sub.text'),
            r('{').many(n('node'), 'sub.nodes').r('}')
          ]
        )
    }
  })
}

// {
//   tokenType: 'attribute',
//   ref: 'name',
//   next: [
//     null,
//     [
//       {
//         nonterm: '_ref_0',
//         next: {
//           tokenType: 'attribute',
//           ref: 'attrName',
//           next: {
//             tokenType: '=',
//             next: [
//               {
//                 tokenType: 'string"'
//               },
//               {
//                 tokenType: "string'"
//               },
//               {
//                 tokenType: '()'
//               }
//             ].ref = 'attrValue'
//           }
//         }
//       },
//       {
//         tokenType: 'attribute',
//         ref: 'attrName',
//         next: {
//           tokenType: '=',
//           next: [
//             {
//               tokenType: 'string"'
//             },
//             {
//               tokenType: "string'"
//             },
//             {
//               tokenType: '()'
//             }
//           ].ref = 'attrValue'
//         }
//       }
//     ]
//   ].next = {
//   }
// }

/*
node = attribute[name] attrs[attrs] ({ node[sub]* } | ;[nil-sub] | STRING[text-sub]) | STRING[text-node]
attrs = (attribute[name] = STRING[value])*
 */
