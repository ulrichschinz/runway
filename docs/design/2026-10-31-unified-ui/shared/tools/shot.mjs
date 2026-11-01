#!/usr/bin/env node
// Screenshot a prototype page, or any URL, and report console errors, so a builder or critic
// can look at the real result instead of guessing. For a prototype page it serves the design
// folder over HTTP itself (ES modules do not load from file://); with --url it loads that URL
// as it is (for example the runway SPA on the Vite dev server).
//
// Usage (relative paths are relative to the design folder 2026-10-31-unified-ui/):
//   node shared/tools/shot.mjs <page.html> <out.png> [options]      a prototype page
//   node shared/tools/shot.mjs --url=<absolute URL> <out.png> [options]   any URL (no page argument)
// Options:
//   --size=desktop|narrow|tablet|phone|WxH   viewport (default desktop = 1440x900; narrow = 1024x768;
//                                    tablet = 1024x1366; phone = 412x915 @2x, mobile + touch)
//   --wait=MS                         wait after load before the shot (default 1800)
//   --dark                            prefers-color-scheme: dark (the old runway UI ignores it and
//                                     reads localStorage.theme instead: add --storage=theme=dark)
//   --reduced                         prefers-reduced-motion: reduce
//   --full                            full-page screenshot
//   --eval="JS"                       run in the page after load (e.g. switch a view), then wait again
//   --hash=#view                      append a hash to the URL
//   --url=URL                         screenshot this absolute URL instead of serving a design page
//   --login=user:pass                 with --url: POST <origin>/api/auth/login {username, password}
//                                     first and inject the token (localStorage.token, .username, the
//                                     keys frontend/src/stores/auth.js reads) with
//                                     context.addInitScript, once per tab, so the page loads logged in
//   --storage=key=value               set a localStorage entry before load (repeatable; e.g.
//                                     --storage=ui=neu --storage=theme=dark); once per tab, after the
//                                     login token, on the --url origin only (or the design server's)
//   --browser=chrome|chromium|webkit  chrome (default: Playwright Chromium driving installed Google
//                                     Chrome, GPU on), chromium (Playwright's own build, if installed)
//                                     or webkit (Playwright WebKit, i.e. Safari's engine)
//   --axe[=path/to/axe.min.js]        inject axe-core after load (and after --eval) and print the
//                                     serious and critical violations (id, impact, help, targets) and
//                                     their count. axe-core is looked up at the given path, then
//                                     $AXE_CORE_PATH, then beside the Playwright install (PW below);
//                                     none found exits 2, so a missing axe never reads as "0 issues"
//   --requests                        print every request (method, status, URL) in the order sent
// Prints: the PNG path, page errors, console errors and warnings, failed requests, the number of
// WebGL canvases, and with --axe / --requests their reports. Exit code 0 unless the tool itself
// fails (a login refused, a page that does not load: 1; a bad option or --axe without axe-core: 2);
// findings never change the exit code.
//
// Examples (the runway dev harness: backend :8000, Vite :5173, user demo):
//   node shared/tools/shot.mjs 06-kombination/index.html /tmp/06.png --size=phone --dark
//   node shared/tools/shot.mjs --url=http://127.0.0.1:5173/next /tmp/next.png --login=demo:demo-passwort-2026
//   node shared/tools/shot.mjs --url=http://127.0.0.1:5173/next?ui=neu /tmp/neu.png \
//        --login=demo:demo-passwort-2026 --size=narrow --dark --axe --browser=webkit

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PW = '/Users/uli/projects/agentic-reach/agentic-reach-marketing/projekte/260917-website-neuausrichtung/motion-graphics/01-agent-waechst/node_modules/playwright'
// axe-core installed next to that Playwright (`npm install axe-core` in its node_modules' parent).
const PW_AXE = path.join(path.dirname(PW), 'axe-core', 'axe.min.js')
const playwright = createRequire(import.meta.url)(PW)

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const opt = {}
const storage = []
for (const a of args.filter((x) => x.startsWith('--'))) {
  const [k, ...v] = a.slice(2).split('=')
  const value = v.length ? v.join('=') : true
  if (k === 'storage') storage.push(value)
  else opt[k] = value
}
const USAGE = 'usage: node shared/tools/shot.mjs <page.html> <out.png> [options]\n'
  + '       node shared/tools/shot.mjs --url=<absolute URL> <out.png> [options]\n'
  + 'options: --size=desktop|narrow|tablet|phone|WxH --wait=ms --dark --reduced --full --eval=JS --hash=#x\n'
  + '         --login=user:pass --storage=key=value (repeatable) --browser=chrome|chromium|webkit --axe[=path] --requests'
const die = (msg) => { console.error(msg); process.exit(2) }
const KNOWN = ['size', 'wait', 'dark', 'reduced', 'full', 'eval', 'hash', 'url', 'login', 'browser', 'axe', 'requests']
for (const k of Object.keys(opt)) if (!KNOWN.includes(k)) die(`unknown option --${k}\n${USAGE}`)

const urlMode = typeof opt.url === 'string'
if (opt.url === true) die(`--url needs a value: --url=http://127.0.0.1:5173/next\n${USAGE}`)
if (urlMode ? positional.length !== 1 : positional.length !== 2) die(USAGE)
const [page, out] = urlMode ? [null, positional[0]] : positional
let target = null
if (urlMode) {
  try { target = new URL(opt.url) } catch { die(`--url is not an absolute URL: ${opt.url}`) }
}
if (opt.login && !urlMode) die('--login needs --url (it logs in against <url origin>/api/auth/login)')
if (opt.login === true || (opt.login && !String(opt.login).includes(':'))) die('--login=user:pass')
for (const s of storage) if (s === true || !String(s).includes('=')) die(`--storage=key=value, got --storage${s === true ? '' : '=' + s}`)
const browserName = opt.browser || 'chrome'
if (!['chrome', 'chromium', 'webkit'].includes(browserName)) die(`--browser must be chrome, chromium or webkit, got ${browserName}`)
// --axe is resolved before anything runs: an accessibility check that silently did not run would
// pass for one that found nothing.
let axePath = null
if (opt.axe) {
  const candidates = [typeof opt.axe === 'string' ? opt.axe : null, process.env.AXE_CORE_PATH, PW_AXE].filter(Boolean)
  axePath = candidates.find((p) => fs.existsSync(p)) || null
  if (!axePath) die(`--axe: axe-core not found (tried ${candidates.join(', ')}); npm install axe-core and pass --axe=<path>/axe.min.js or set AXE_CORE_PATH`)
}

const SIZES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  narrow: { width: 1024, height: 768, deviceScaleFactor: 1 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
let size = SIZES[opt.size || 'desktop']
if (!size) {
  const [w, h] = String(opt.size).split('x').map(Number)
  if (!w || !h) die(`--size must be desktop, narrow, tablet, phone or WxH, got ${opt.size}`)
  size = { width: w, height: h, deviceScaleFactor: 1 }
}

// The design folder's own server, only when a prototype page is shot.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' }
let server = null
let url
if (urlMode) {
  url = `${opt.url}${opt.hash || ''}`
} else {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return }
    const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel)
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${server.address().port}/${page.replace(/^\.?\//, '')}${opt.hash || ''}`
}
const origin = new URL(url).origin

// --login: the same request the SPA's login form sends (frontend/src/stores/auth.js).
const initial = []
if (opt.login) {
  const i = String(opt.login).indexOf(':')
  const username = String(opt.login).slice(0, i)
  const password = String(opt.login).slice(i + 1)
  let res
  try {
    res = await fetch(`${origin}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    })
  } catch (e) {
    console.error(`login: ${origin}/api/auth/login not reachable (${e.cause?.code || e.message})`)
    server?.close(); process.exit(1)
  }
  const body = await res.text()
  if (!res.ok) { console.error(`login: ${res.status} ${body}`); server?.close(); process.exit(1) }
  initial.push(['token', JSON.parse(body).access_token], ['username', username])
}
for (const s of storage) {
  const j = String(s).indexOf('=')
  initial.push([String(s).slice(0, j), String(s).slice(j + 1)])
}

let browser
try {
  if (browserName === 'chrome') {
    browser = await playwright.chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
  } else if (browserName === 'chromium') {
    browser = await playwright.chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
  } else {
    browser = await playwright.webkit.launch()
  }
} catch (e) {
  console.error(`cannot launch ${browserName}: ${e.message.split('\n').slice(0, 4).join('\n')}`)
  if (browserName !== 'chrome') console.error(`install it with: node ${PW}/cli.js install ${browserName}`)
  server?.close(); process.exit(1)
}
const context = await browser.newContext({
  viewport: { width: size.width, height: size.height },
  deviceScaleFactor: size.deviceScaleFactor,
  isMobile: !!size.isMobile,
  hasTouch: !!size.hasTouch,
  colorScheme: opt.dark ? 'dark' : 'light',
  reducedMotion: opt.reduced ? 'reduce' : 'no-preference',
})
if (initial.length) {
  // Before any page script, on the target origin only, and once per tab: a later navigation
  // (the SPA sending a 401 to /login, a logout) must not get the token back.
  await context.addInitScript(({ origin, entries }) => {
    if (location.origin !== origin) return
    try {
      if (sessionStorage.getItem('__shot_init__')) return
      for (const [k, v] of entries) localStorage.setItem(k, v)
      sessionStorage.setItem('__shot_init__', '1')
    } catch { /* storage blocked: the page loads without it */ }
  }, { origin, entries: initial })
}
const tab = await context.newPage()
const errors = []
tab.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
tab.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`) })
tab.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
const requests = new Map() // request -> status, in the order sent
if (opt.requests) {
  tab.on('request', (r) => requests.set(r, null))
  tab.on('response', (res) => { if (requests.has(res.request())) requests.set(res.request(), res.status()) })
}

try {
  await tab.goto(url, { waitUntil: 'load' })
} catch (e) {
  console.error(`cannot load ${url}: ${e.message.split('\n')[0]}`)
  await browser.close(); server?.close(); process.exit(1)
}
await tab.waitForTimeout(Number(opt.wait || 1800))
if (opt.eval) {
  await tab.evaluate(opt.eval)
  await tab.waitForTimeout(Number(opt.wait || 1800))
}
const canvases = await tab.evaluate(() => [...document.querySelectorAll('canvas')]
  .filter((c) => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }).length)
const outPath = path.resolve(ROOT, out)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
await tab.screenshot({ path: outPath, fullPage: !!opt.full })
console.log(`shot: ${outPath} (${size.width}x${size.height}, ${browserName}, webgl canvases: ${canvases})`)
console.log(errors.length ? errors.join('\n') : 'no errors')

if (axePath) {
  await tab.addScriptTag({ path: axePath })
  const result = await tab.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ['violations'] })
    return {
      version: r.testEngine?.version,
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) })),
    }
  })
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const other = result.violations.length - bad.length
  console.log(`axe ${result.version}: ${bad.length} serious/critical violation(s)${other ? ` (+${other} moderate/minor not listed)` : ''}`)
  for (const v of bad) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.targets.length} node${v.targets.length === 1 ? '' : 's'})`)
    for (const t of v.targets) console.log(`      ${t}`)
  }
}
if (opt.requests) {
  console.log(`requests: ${requests.size}`)
  for (const [r, status] of requests) console.log(`  ${r.method()} ${status ?? '---'} ${r.url()}`)
}
await browser.close()
server?.close()
