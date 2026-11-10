#!/usr/bin/env node
// Regenerates the design token files from frontend/tokens/tokens.json:
//   node tools/gen-tokens.mjs
// writes frontend/src/assets/tokens.css, frontend/tokens/tailwind-tokens.js and
// frontend/tokens/RunwayTokens.kt. The generator itself is frontend/tokens/generate.js, so the
// frontend test that fails on a hand-edited output runs the same code (brief 0047).

import { readFileSync, writeFileSync } from 'node:fs'
import { generateTokens } from '../frontend/tokens/generate.js'

const frontend = new URL('../frontend/', import.meta.url)
const tokens = JSON.parse(readFileSync(new URL('tokens/tokens.json', frontend), 'utf8'))

for (const [path, text] of Object.entries(generateTokens(tokens))) {
  writeFileSync(new URL(path, frontend), text)
  console.log(`wrote frontend/${path}`)
}
