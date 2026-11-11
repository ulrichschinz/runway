/**
 * The new UI's lazy pages stay lazy (plan M13, brief 0060; M14, brief 0061): `router/lazyPages.js`
 * is the one file that loads `ProjectsPage`, `ProjectPage`, `ReviewPage`, `SettingsPage` and
 * `LoginPage`, with `import()`, and no file imports them statically. This departs from plan §6.2 (static imports) for the entry budget;
 * the index records the dynamic edges as UNKNOWN (`BLIND-FE-002`), so this scan is what holds them,
 * as `threeIsolation.test.js` holds the lens chunk.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const LAZY = 'router/lazyPages.js'
const PAGES = {
  'projects/ProjectsPage.vue': 'ProjectsPage',
  'projects/ProjectPage.vue': 'ProjectPage',
  'tasks/views/ReviewPage.vue': 'ReviewPage',
  'identity/SettingsPage.vue': 'SettingsPage',
  'identity/LoginPage.vue': 'LoginPage',
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(js|mjs|vue|ts)$/.test(name) ? [path] : []
  })
}
const sources = files(SRC).map((path) => ({ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `from '…/ProjectsPage.vue'`, `import '…/ProjectsPage.vue'`, `export … from` */
const staticImport = (base) => new RegExp(`(?:\\bfrom\\s*|^\\s*import\\s+)['"][^'"]*/${esc(base)}['"]`, 'm')
const dynamicImport = (base) => new RegExp(`\\bimport\\s*\\(\\s*['"][^'"]*/${esc(base)}['"]\\s*\\)`)

describe('lazy pages', () => {
  it('finds the sources and the pages it scans', () => {
    expect(sources.length).toBeGreaterThan(50)
    for (const file of [LAZY, ...Object.keys(PAGES)]) expect(sources.some((s) => s.file === file), file).toBe(true)
  })

  for (const [file, name] of Object.entries(PAGES)) {
    const base = file.split('/').pop()

    it(`${name} is never imported statically`, () => {
      expect(sources.filter((s) => staticImport(base).test(s.text)).map((s) => s.file)).toEqual([])
    })

    it(`only ${LAZY} loads ${name}, with import()`, () => {
      expect(sources.filter((s) => dynamicImport(base).test(s.text)).map((s) => s.file)).toEqual([LAZY])
    })
  }

  it('the router takes the five pages from lazyPages.js', () => {
    const router = sources.find((s) => s.file === 'router/index.js').text
    expect(router).toMatch(
      /import\s*\{\s*LoginPage,\s*ProjectPage,\s*ProjectsPage,\s*ReviewPage,\s*SettingsPage\s*\}\s*from\s*'\.\/lazyPages\.js'/,
    )
  })

  it('the placeholder page is gone: every route of the new UI has its own page (M14)', () => {
    expect(sources.some((s) => s.file === 'layout/ComingPage.vue')).toBe(false)
    expect(sources.filter((s) => /\bComingPage\b/.test(s.text)).map((s) => s.file)).toEqual([])
  })

  it('the patterns catch both ways of importing a page', () => {
    expect(staticImport('ProjectPage.vue').test("import ProjectPage from '../projects/ProjectPage.vue'")).toBe(true)
    expect(staticImport('ProjectPage.vue').test("export { default } from './ProjectPage.vue'")).toBe(true)
    expect(staticImport('ProjectPage.vue').test("import ProjectsPage from '../projects/ProjectsPage.vue'")).toBe(false)
    expect(dynamicImport('ProjectPage.vue').test("const load = () => import('../projects/ProjectPage.vue')")).toBe(true)
  })
})
