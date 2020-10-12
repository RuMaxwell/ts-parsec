import fs from 'fs'
import pathlib from 'path'

export const noShift = (function() {
  const path = pathlib.resolve('./test/srcs/no-shift-src.nos')
  const source = fs.readFileSync(path).toString()
  return source
})()

export const jssa = (function() {
  const path = pathlib.resolve('./test/srcs/jssa-src.jssa')
  const source = fs.readFileSync(path).toString()
  return source
})()

/*
{"a":1,"b":true,"c":"good","e":[1,"wow",null],"f":{"x":1,"y":"name","z":"wow"}}
*/
export const json = JSON.stringify({
  a: 1, b: true, c: 'good', d: undefined, e: [1, 'wow', null], f: { x: 1, y: 'name', z: 'wow' }
})

export const test = '1 1'
