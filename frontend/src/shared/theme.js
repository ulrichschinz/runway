/**
 * Which colour scheme the new UI shows, decided from the stored choice and the system's.
 *
 * WHY THIS EXISTS. The new UI follows the system's light or dark preference unless the person
 * chose one (plan M1). The choice is stored under the key the old UI's `useDarkMode` already
 * uses, `theme`, with the same two values, `light` and `dark`, so both UIs read one choice: a
 * stored `dark` is dark in both. They differ only where nothing is stored: the old UI is then
 * light (commit cb707b4), the new one follows the system. Choosing "System" removes the key,
 * which the old UI reads as light.
 *
 * The effects (storage, the media query, the document) live in `composables/useTheme.js`.
 */

import { themeColor } from '../../tokens/tailwind-tokens.js'

/**
 * The scheme a stored value names, or null when it names none. Only the two values either UI
 * writes count; anything else is treated as no choice.
 *
 * @param {unknown} value  what `localStorage['theme']` holds
 * @returns {'light'|'dark'|null}
 */
export function parseTheme(value) {
  return value === 'light' || value === 'dark' ? value : null
}

/**
 * A stored choice wins over the system preference.
 *
 * @param {unknown} storedValue  what `localStorage['theme']` holds
 * @param {boolean} systemDark   whether `(prefers-color-scheme: dark)` matches
 * @returns {'light'|'dark'}
 */
export function resolveTheme(storedValue, systemDark) {
  return parseTheme(storedValue) ?? (systemDark ? 'dark' : 'light')
}

/**
 * The browser chrome colour (`<meta name="theme-color">`) for a scheme: the page background
 * from the design tokens.
 *
 * @param {'light'|'dark'} scheme
 * @returns {string}  a hex colour
 */
export function themeColorFor(scheme) {
  return themeColor[scheme]
}
