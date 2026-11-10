import { computed, effectScope, ref, watchEffect } from 'vue'
import { parseTheme, resolveTheme, themeColorFor } from '../shared/theme.js'

let state = null

/**
 * The new UI's colour scheme: the system's, unless the person chose light or dark.
 *
 * The first call starts it: it reads `localStorage['theme']`, follows
 * `(prefers-color-scheme: dark)` while nothing is chosen, and keeps the document in step —
 * `data-theme` on `<html>` (which switches the tokens in `assets/tokens.css`), the `dark` class
 * (so Tailwind's `dark:` variants agree) and `<meta name="theme-color">`. Later calls share that
 * state. The old UI keeps `useDarkMode` and never calls this, so nothing changes for it
 * (brief 0047). The decision itself is `shared/theme.js`.
 *
 * The state lives in a detached effect scope, not in the scope of whichever component calls
 * first: otherwise that component's unmount would stop the watcher for good, and later choices
 * and system changes would reach storage but no longer the document (held by
 * `tests/useTheme.test.js`).
 *
 * Storage access is guarded: a browser refusing site data still gets the system's scheme, and a
 * choice then lasts only for the page load.
 *
 * @returns {{
 *   choice: import('vue').ComputedRef<'system'|'light'|'dark'>,
 *   theme: import('vue').ComputedRef<'light'|'dark'>,
 *   setChoice: (choice: 'system'|'light'|'dark') => void,
 * }}
 */
export function useTheme() {
  if (!state) state = effectScope(true).run(start)
  return state
}

function readStored() {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    if (value) localStorage.setItem('theme', value)
    else localStorage.removeItem('theme')
  } catch {
    // Storage refused: the choice still applies until the page is left.
  }
}

function applyToDocument(theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorFor(theme))
}

function start() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const stored = ref(parseTheme(readStored()))
  const systemDark = ref(media.matches)
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })

  const theme = computed(() => resolveTheme(stored.value, systemDark.value))
  watchEffect(() => applyToDocument(theme.value), { flush: 'sync' })

  return {
    choice: computed(() => stored.value ?? 'system'),
    theme,
    setChoice(choice) {
      stored.value = parseTheme(choice)
      writeStored(stored.value)
    },
  }
}
