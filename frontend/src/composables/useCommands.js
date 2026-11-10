import { ref, shallowReactive } from 'vue'
import { modKey, paletteCommands, paletteHint } from '../shared/commands.js'
import { t } from '../shared/i18n.js'
import { rankPalette } from '../shared/paletteRank.js'
import { activeKeymap } from './useKeymap.js'

/** The palette and the `?` sheet mark themselves modal through here (`useKeymap.js`). */
export { useModal } from './useKeymap.js'

/**
 * The command palette's registry (plan 6.1, M9): what `layout/CommandPalette.vue` lists, without
 * the layout importing a feature. Commands come from the mounted keymaps (`activeKeymap`), read
 * through the one table; todos, projects and "Als Todo erfassen" come from search providers that
 * a feature registers at runtime (`fe/tasks`: `tasks/useTaskSearch.js`).
 *
 * Also the `/` search's query, shared by the field in the frame (`fe/layout`) and the list that
 * shows the hits (`fe/tasks`).
 */

/**
 * A provider's hit: `group` `todo`, `proj` or `new`; `keywords` match after the label (a todo's
 * project and tags); `always` keeps it whatever the query says ("Als Todo erfassen").
 *
 * @typedef {{group: string, label: string, sub?: string, hint?: string, keywords?: string[], always?: boolean, run: () => void}} PaletteHit
 */

const providers = shallowReactive(new Set())

/** The `/` search, as typed; empty while nobody searches. */
export const searchQuery = ref('')

/**
 * Register a search provider while the app runs.
 *
 * @param {(query: string) => PaletteHit[]} provider called with the raw query (never empty)
 * @returns {() => void} unregisters it
 */
export function registerSearch(provider) {
  providers.add(provider)
  return () => providers.delete(provider)
}

/** How the palette's key is shown here: `⌘` or `Ctrl`. */
export const paletteMod = modKey(globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform)

/** The palette's key as the top line and the rail show it: `⌘K`, or `Ctrl K` as the `?` sheet says. */
export const paletteKeyHint = paletteHint(paletteMod)

/**
 * The palette's entries for a query, in display order, each with the label to show and the
 * function to run. Reactive when read inside a computed.
 *
 * @param {string} query as typed
 * @returns {Array<{group: string, label: string, sub?: string, hint: string, run: () => void}>}
 */
export function paletteItems(query) {
  const active = activeKeymap()
  const commands = paletteCommands(active, undefined, paletteMod).map((c) => ({
    group: c.group,
    label: t(c.label, { v: t(c.of), ...c.params }),
    hint: c.hint,
    run: () => active.handlers[c.id](),
  }))
  const raw = query.trim()
  const hits = raw ? [...providers].flatMap((provider) => provider(raw)).map((hit) => ({ hint: '', ...hit })) : []
  return rankPalette([...commands, ...hits], raw)
}
