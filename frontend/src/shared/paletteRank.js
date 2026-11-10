/**
 * What the command palette shows for a query, in which order (06 `renderPalette`, plan M9).
 *
 * Items come in groups: the commands (`act`, `nav`, `ctx`, `look`), then the hits of the search
 * providers (`todo`, `proj`) and the capture line (`new`). Without a query the palette lists every
 * command and nothing else. With one, an item matches when its label — or, after it, one of its
 * keywords (a todo's project and tags) — contains the query; the closer to the start, the higher:
 * the label starts with it, a word of it does, it is somewhere inside. The best six commands, five
 * todos and three projects stay, each group in its place, a tie in the order it was given;
 * an item marked `always` ("Als Todo erfassen: „…“") is kept whatever it says.
 */

export const GROUPS = ['act', 'nav', 'ctx', 'look', 'todo', 'proj', 'new']

const COMMAND_GROUPS = ['act', 'nav', 'ctx', 'look']

/** How many hits of a kind a query keeps. */
export const CAPS = { commands: 6, todo: 5, proj: 3 }

/** A rank after every label rank: a match in a keyword only. */
const KEYWORD = 3

/**
 * The query as it is compared: trimmed, lower-cased.
 *
 * @param {string} query
 */
export function needleOf(query) {
  return String(query ?? '').trim().toLowerCase()
}

/**
 * Where a text contains the needle: 0 at its start, 1 at the start of a word, 2 elsewhere,
 * -1 not at all. A word starts after a space or one of `-_/.,:;(„"@+`.
 *
 * @param {string} text
 * @param {string} needle from `needleOf`
 */
export function matchRank(text, needle) {
  const hay = String(text ?? '').toLowerCase()
  const at = hay.indexOf(needle)
  if (at < 0) return -1
  if (at === 0) return 0
  for (let i = at; i >= 0; i = hay.indexOf(needle, i + 1)) {
    if (/[\s\-_/.,:;(„"@+]/.test(hay[i - 1])) return 1
  }
  return 2
}

/**
 * @param {{label: string, keywords?: string[]}} item
 * @param {string} needle
 * @returns {number} -1 for no match
 */
function itemRank(item, needle) {
  const own = matchRank(item.label, needle)
  if (own >= 0) return own
  const ranks = (item.keywords ?? []).map((k) => matchRank(k, needle)).filter((r) => r >= 0)
  return ranks.length ? KEYWORD + Math.min(...ranks) : -1
}

/**
 * The palette's list for a query.
 *
 * @template {{group: string, label: string, keywords?: string[], always?: boolean}} T
 * @param {T[]} items commands first, then the providers' hits (`todo`, `proj`, `new`)
 * @param {string} query as typed
 * @param {typeof CAPS} [caps]
 * @returns {T[]} in display order: by group, best match first, ties as given
 */
export function rankPalette(items, query, caps = CAPS) {
  const needle = needleOf(query)
  const order = (item) => GROUPS.indexOf(item.group)
  const indexed = items.map((item, index) => ({ item, index }))
  if (!needle) {
    return indexed
      .filter(({ item }) => COMMAND_GROUPS.includes(item.group))
      .sort((a, b) => order(a.item) - order(b.item) || a.index - b.index)
      .map(({ item }) => item)
  }
  const ranked = indexed
    .map((x) => ({ ...x, rank: x.item.always ? 0 : itemRank(x.item, needle) }))
    .filter((x) => x.rank >= 0)
  const best = (list, cap) => [...list].sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, cap)
  const kept = [
    ...best(ranked.filter((x) => COMMAND_GROUPS.includes(x.item.group)), caps.commands),
    ...best(ranked.filter((x) => x.item.group === 'todo'), caps.todo),
    ...best(ranked.filter((x) => x.item.group === 'proj'), caps.proj),
    ...ranked.filter((x) => !COMMAND_GROUPS.includes(x.item.group) && !(x.item.group in caps)),
  ]
  return kept
    .sort((a, b) => order(a.item) - order(b.item) || a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}
