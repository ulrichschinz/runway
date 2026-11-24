// The built SPA against the strict Content-Security-Policy frontend/nginx.conf declares (brief
// 0076, ADR 0048, finding SEC-004).
//
// The policy is same-origin only: `script-src 'self'` and `style-src 'self'` with no
// 'unsafe-inline' and no 'unsafe-eval'. Whether the SPA still works under it is decided by what
// the BUILD emits, not by the sources — Vite injects the entry script, hoists styles into files,
// and Vue's compiler decides whether a static subtree becomes an innerHTML string (whose style=""
// attributes the policy would block) or vnodes (whose styles are set through the CSSOM, which it
// does not). So this builds the app and reads the output.
//
// What this does not prove: that a browser runs every view without a violation. The brief records
// the one-off headless-browser pass under the enforced policy; the policy itself stays
// report-only until SHIM-WEB-001's soak ends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')

const sameOrigin = (url) =>
  url.startsWith('/') ? !url.startsWith('//') : !/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('data:')

export function scanHtml(html) {
  const problems = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1])) problems.push('inline <script> without src')
    else if (m[2].trim()) problems.push('<script src> with inline content')
  }
  for (const m of html.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=/gi)) problems.push(`inline handler ${m[1]}`)
  for (const m of html.matchAll(/<[a-z][^>]*\sstyle\s*=/gi)) problems.push(`style attribute: ${m[0].slice(0, 40)}`)
  if (/<style\b/i.test(html)) problems.push('inline <style> element')
  for (const m of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (!sameOrigin(m[1])) problems.push(`off-origin reference ${m[1]}`)
  }
  if (/javascript:/i.test(html)) problems.push('javascript: URL')
  return problems
}

export function scanJs(js) {
  const problems = []
  if (/\beval\s*\(/.test(js)) problems.push('eval(')
  if (/\bnew\s+Function\s*\(/.test(js)) problems.push('new Function(')
  if (/\bstyle=\\?["']/.test(js)) problems.push('a style="" attribute inside an HTML string')
  if (/\bsetAttribute\(\s*["']style["']/.test(js)) problems.push('setAttribute("style")')
  if (/javascript:/i.test(js)) problems.push('javascript: URL')
  return problems
}

export function scanCss(css) {
  const problems = []
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!sameOrigin(m[1])) problems.push(`off-origin url(${m[1]})`)
  }
  if (/@import\s/i.test(css)) problems.push('@import')
  return problems
}

describe('the scanner can fail', () => {
  it('refuses an inline script, an inline handler and a style attribute', () => {
    expect(scanHtml('<script>alert(1)</script>')).toContain('inline <script> without src')
    expect(scanHtml('<img src="/x.png" onerror="x()">')).toContain('inline handler onerror')
    expect(scanHtml('<div style="color:red"></div>').length).toBe(1)
    expect(scanHtml('<script src="https://cdn.example/x.js"></script>')).toContain(
      'off-origin reference https://cdn.example/x.js',
    )
  })

  it('refuses eval, new Function and an HTML string carrying style=""', () => {
    expect(scanJs('const f = eval("1")')).toContain('eval(')
    expect(scanJs('new Function("return 1")')).toContain('new Function(')
    expect(scanJs('el.innerHTML = "<stop style=\\"x\\">"')).toContain(
      'a style="" attribute inside an HTML string',
    )
  })

  it('refuses an off-origin font and an @import', () => {
    expect(scanCss('src: url(https://fonts.example/a.woff2)')).toContain(
      'off-origin url(https://fonts.example/a.woff2)',
    )
    expect(scanCss('@import "x.css";')).toContain('@import')
    expect(scanCss('src: url(/assets/a.woff2); background: url(data:image/png;base64,AA)')).toEqual([])
  })
})

describe('the production build runs under the strict policy', () => {
  let out

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'runway-csp-'))
    await build({
      root: FRONTEND,
      configFile: join(FRONTEND, 'vite.config.js'),
      logLevel: 'silent',
      build: { outDir: out, emptyOutDir: true },
    })
  }, 120_000)

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true })
  })

  it('serves an index.html with no inline script, style or handler', () => {
    expect(scanHtml(readFileSync(join(out, 'index.html'), 'utf8'))).toEqual([])
  })

  it('emits no script the policy would block', () => {
    const files = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'))
    expect(files.length).toBeGreaterThan(0)
    const found = files.flatMap((f) =>
      scanJs(readFileSync(join(out, 'assets', f), 'utf8')).map((p) => `${f}: ${p}`),
    )
    expect(found).toEqual([])
  })

  it('emits no stylesheet that reaches off the origin', () => {
    const files = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.css'))
    const found = files.flatMap((f) =>
      scanCss(readFileSync(join(out, 'assets', f), 'utf8')).map((p) => `${f}: ${p}`),
    )
    expect(found).toEqual([])
  })
})
