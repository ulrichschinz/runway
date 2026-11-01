/**
 * GTD contexts on Nächste: which chips exist, in which order, and the numbers on them.
 *
 * Decision D1 (plan §2): no hardcoded web set. The chips are the contexts present in the
 * user's open todos, the shared preset first (only those present), then every other
 * present context in German collation — the same order Android computes from the same
 * vectors. Contexts exist only as tags, so nothing is stored.
 *
 * The chip and the eyebrow call `chipCount`, so they can never disagree (critic 5). Pure.
 */

import { contextTagsOf, isNext } from './gtdRules.js'
import { t } from './i18n.js'

/** Shared with Android (its `ContextSettings` preset). */
export const CONTEXT_PRESET = ['@home', '@computer', '@work', '@business']

/** The filter value for "ohne Kontext": todos without any context. */
export const NO_CONTEXT = '-'

const collator = new Intl.Collator('de')

/**
 * @param {string[]} present the contexts the open todos carry
 * @param {string[]} [preset]
 * @returns {string[]} preset entries that are present, in preset order, then the rest
 *   in German collation; each once
 */
export function orderContexts(present, preset = CONTEXT_PRESET) {
  const unique = [...new Set(present)]
  const first = preset.filter((c) => unique.includes(c))
  const rest = unique.filter((c) => !preset.includes(c)).sort(collator.compare)
  return [...first, ...rest]
}

/** Every context the tasks carry, each once, comma-joined tags split. */
export function presentContexts(tasks) {
  return [...new Set(tasks.flatMap(contextTagsOf))]
}

/**
 * The numbers on the chips. Strict: a context counts the Nächste todos carrying it
 * (the lenient list also shows todos without a context; those are counted apart).
 *
 * @param {object[]} tasks open todos; only Nächste ones (`isNext`) are counted
 * @returns {{all: number, none: number, byContext: Object<string, number>}}
 */
export function contextCounts(tasks) {
  const next = tasks.filter(isNext)
  const byContext = {}
  let none = 0
  for (const task of next) {
    const contexts = [...new Set(contextTagsOf(task))]
    if (contexts.length === 0) none += 1
    for (const c of contexts) byContext[c] = (byContext[c] || 0) + 1
  }
  return { all: next.length, none, byContext }
}

/**
 * The number on one chip: Alle (null), "ohne Kontext" (`NO_CONTEXT`) or a context.
 */
export function chipCount(selected, counts) {
  if (!selected) return counts.all
  if (selected === NO_CONTEXT) return counts.none
  return counts.byContext[selected] || 0
}

/**
 * The eyebrow parts of Nächste after the list name, shown with "·" between them:
 * `['@anrufe', '3', '+1 ohne Kontext']`. The count is the chip's own number; the
 * todos without a context that the lenient filter adds are named apart.
 *
 * @returns {string[]}
 */
export function eyebrowCount(selected, counts) {
  const label = !selected ? t('ctx.allLong') : selected === NO_CONTEXT ? t('ctx.none') : selected
  const parts = [label, String(chipCount(selected, counts))]
  if (selected && selected !== NO_CONTEXT && counts.none > 0) parts.push(t('ctx.plusNone', { n: counts.none }))
  return parts
}
