import fs from 'fs'
import pathlib from 'path'

const noShift = (function() {
  const path = pathlib.resolve('./test/srcs/no-shift-src.nos')
  const source = fs.readFileSync(path).toString()
  return source
})()

const jssa = (function() {
  const path = pathlib.resolve('./test/srcs/jssa-src.jssa')
  const source = fs.readFileSync(path).toString()
  return source
})()

/*
{"a":1,"b":true,"c":"good","e":[1,"wow",null],"f":{"x":1,"y":"name","z":"wow"}}
*/
const json = JSON.stringify({
  a: 1, b: true, c: 'good', d: undefined, e: [1, 'wow', null], f: { x: 1, y: 'name', z: 'wow' }
})

export default {
  'no-shift': noShift,
  jssa,
  json
}
