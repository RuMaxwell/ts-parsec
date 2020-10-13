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

export const json = (function() {
  const path = pathlib.resolve('./test/srcs/test.json')
  const source = fs.readFileSync(path).toString()
  return source
})()

export const test = (function () {
  const path = pathlib.resolve('./test/srcs/test')
  const source = fs.readFileSync(path).toString()
  return source
})()
