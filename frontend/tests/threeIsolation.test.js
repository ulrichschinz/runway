/**
 * Three.js stays in the lazy lens chunk (plan M11, F14): no file but `layout/lens/lens3d.js`
 * imports `three`, nothing imports `lens3d.js` statically, and the controller reaches it with
 * `import()`. The index records that dynamic edge as UNKNOWN (`BLIND-FE-002`), so this scan is
 * what holds it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const LENS3D = 'layout/lens/lens3d.js'

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(js|mjs|vue|ts)$/.test(name) ? [path] : []
  })
}
const sources = files(SRC).map((path) => ({ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))

// `import … from 'three'`, `import 'three/…'`, `import('three')`, `export … from 'three'`, require
const THREE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]three(?:\/[^'"]*)?['"]/

describe('three.js isolation', () => {
  it('finds the sources it scans', () => {
    expect(sources.length).toBeGreaterThan(50)
    expect(sources.some((s) => s.file === LENS3D)).toBe(true)
  })

  it('no file but layout/lens/lens3d.js imports three', () => {
    const importers = sources.filter((s) => THREE_IMPORT.test(s.text)).map((s) => s.file)
    expect(importers).toEqual([LENS3D])
  })

  it('lens3d.js is never imported statically', () => {
    const staticImport = /(?:\bfrom\s*|^\s*import\s+)['"][^'"]*lens3d(?:\.js)?['"]/m
    expect(sources.filter((s) => staticImport.test(s.text)).map((s) => s.file)).toEqual([])
  })

  it('only the lens controller loads it, with import()', () => {
    const dynamic = /\bimport\s*\(\s*['"][^'"]*lens3d(?:\.js)?['"]\s*\)/
    expect(sources.filter((s) => dynamic.test(s.text)).map((s) => s.file)).toEqual(['layout/lens/lensController.js'])
  })

  it('the pattern catches every way of importing three', () => {
    for (const line of [
      "import * as THREE from 'three'",
      "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'",
      "const m = await import('three')",
      "import 'three'",
      "export { Color } from \"three\"",
    ]) expect(THREE_IMPORT.test(line)).toBe(true)
    expect(THREE_IMPORT.test("import { threeIsolation } from './threeish.js'")).toBe(false)
  })
})
