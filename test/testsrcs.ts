import fs from 'fs'
import pathlib from 'path'

const noShift = (function() {
  const path = pathlib.resolve('./test/no-shift-src.nos')
  const source = fs.readFileSync(path).toString()
  return source
})()

const jssa = (function() {
  const path = pathlib.resolve('./test/jssa-src.jssa')
  const source = fs.readFileSync(path).toString()
  return source
})()

export default {
  'no-shift': noShift,
  jssa,
}
