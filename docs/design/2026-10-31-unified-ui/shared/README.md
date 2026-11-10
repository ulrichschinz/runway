# Shared foundation for the five unified-UI proposals

Everything every proposal uses, so the five stay comparable. Do not edit these files from a
proposal; derive what you need in the proposal's own folder.

| Path | What |
|---|---|
| `brand/tokens.css` | Agentic Reach brand tokens, unchanged copy (`ORIGIN.md`) |
| `brand/fonts/fonts.css` | `@font-face` for Space Grotesk 400/500/700, Fraunces italic 300/400, JetBrains Mono 400/600 (local woff2) |
| `brand/logos/mark-*.svg` | the brand mark (color, mono dark, mono light); never redraw or recolor |
| `data/tasks.js` | demo tasks, projects, contexts and helpers (`buckets`, `contextsOf`, `tagParts`, `parseTw`); "today" is 2026-10-31 |
| `tools/shot.mjs` | screenshots plus console errors: `node shared/tools/shot.mjs <page> <out.png> --size=desktop|phone|WxH [--dark] [--reduced] [--eval=JS] [--full]` |
| `inventory.md` | what both apps do today (features, flows, parity gaps) |

## Page conventions

Each proposal folder `NN-slug/` contains:

- `index.html`: the web app prototype (desktop first, responsive down to phone width)
- `android.html`: the Android prototype (phone frame plus the Android-only surfaces: home-screen widget, Quick Settings tile with its capture overlay, share target)
- `README.md`: the concept and the build plan for web (Vue 3) and Android (Jetpack Compose)
- `shots/`: verified screenshots (`web-desktop.png`, `web-dark.png`, `web-phone.png`, `web-reduced.png`, `android.png`, plus the signature moment)

Head of every page:

```html
<link rel="stylesheet" href="../shared/brand/fonts/fonts.css">
<link rel="stylesheet" href="../shared/brand/tokens.css">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>
```

Data: `import { TASKS, PROJECTS, CONTEXTS, buckets } from '../shared/data/tasks.js'` (copy the
array before mutating it).

## Test hook (every page)

So critics and the overview can drive each prototype the same way:

```js
window.proto = {
  show(view),        // 'inbox' | 'next' | 'waiting' | 'projects' | 'someday'
  filter(context),   // '@anrufe' or null
  capture(text),     // adds to the inbox, with the proposal's normal feedback
  open(id),          // opens task details
  complete(id),      // completes a task, with the proposal's signature feedback
  clarify(id, to),   // inbox item -> 'next:@computer' | 'waiting' | 'someday' | 'delete'
  signature(),       // triggers the proposal's signature moment for a screenshot
}
```

## Viewing

From this folder: `python3 -m http.server 8340 --bind 127.0.0.1`, then open
`http://127.0.0.1:8340/`.
