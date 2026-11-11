/**
 * The weekly review's steps (plan M14, brief 0061; 06 `reviewSteps`, `renderHead('review')`), as a
 * pure rule: the counts the snapshot gives in, the six steps out, each with its message keys, the
 * values for them, whether it is ticked and which list it leads into.
 *
 * A step ticks itself where runway can check it — the Inbox is empty, no active project is stuck —
 * and the person ticks the others by hand (`checked`); a self-ticked step cannot be unticked by
 * hand, because the next look at the list would contradict it.
 *
 * Message keys only (`messages.review.de.js`), no `t()`: the page turns them into text.
 */

/** How many of the week's done todos the page lists before "alle n in Alle zeigen". */
export const DONE_SHOWN = 7

/**
 * @param {{
 *   inbox: number, next: number, due: number, waitingDue: number, waitingSoon: number,
 *   stalled: string[], someday: number,
 * }} counts  `due`: Nächste's Fällig; `waitingDue` / `waitingSoon`: Warten auf's follow-ups that
 *   have come / come within the week; `stalled`: the stuck projects' names, in the overview's order
 * @param {Iterable<number>} [checked] the step ids the person ticked
 * @returns {Array<{
 *   id: number, what: string, why: {key: string, vars?: object}, status: {key: string, vars?: object},
 *   auto: boolean, ok: boolean, go: string|null,
 * }>} `auto`: the step ticks itself (and only then); `go`: the route of its list, or null
 */
export function reviewSteps(counts, checked = []) {
  const ticked = new Set(checked)
  const stalled = counts.stalled ?? []
  const step = (id, s) => {
    const auto = s.auto ?? false
    return { id, what: `rs.${id}`, ...s, auto, ok: auto || ticked.has(id) }
  }
  return [
    step(1, {
      why: { key: 'rs.1w' },
      status: counts.inbox ? { key: 'rs.1s', vars: { n: counts.inbox } } : { key: 'rs.empty' },
      auto: counts.inbox === 0,
      go: '/inbox',
    }),
    step(2, { why: { key: 'rs.2w' }, status: { key: 'rs.2s', vars: { n: counts.next, d: counts.due } }, go: '/next' }),
    step(3, {
      why: { key: 'rs.3w' },
      status: { key: 'rs.3s', vars: { n: counts.waitingDue, s: counts.waitingDue + counts.waitingSoon } },
      go: '/waiting',
    }),
    step(4, {
      why: stalled.length ? { key: 'rs.4stalled', vars: { p: stalled.join(', ') } } : { key: 'rs.4w' },
      status: stalled.length ? { key: 'proj.stalledN', vars: { n: stalled.length } } : { key: 'proj.allMoving' },
      auto: stalled.length === 0,
      go: '/projects',
    }),
    step(5, { why: { key: 'rs.5w' }, status: { key: counts.someday === 1 ? 'rs.5s1' : 'rs.5s', vars: { n: counts.someday } }, go: '/someday' }),
    step(6, { why: { key: 'rs.6w' }, status: { key: 'rs.6s' }, go: null }),
  ]
}

/**
 * The page's eyebrow after "Rückblick" (06 `renderHead('review')`): the day of the last weekly
 * review and how long ago it was, or that none was ever recorded.
 *
 * @param {{day: string|null, days: number|null}|null} age  the store's `reviewAge`; null before the
 *   first snapshot
 * @returns {Array<{key: string, vars?: object}>} the parts, empty before the first snapshot
 */
export function reviewHead(age) {
  if (!age) return []
  if (!age.day) return [{ key: 'review.never' }]
  const ago = !age.days ? { key: 'review.today' } : age.days === 1 ? { key: 'review.ago1' } : { key: 'review.ago', vars: { n: age.days } }
  return [{ key: 'review.last', vars: { day: age.day } }, ago]
}

/**
 * The week's done todos the page lists: the newest `n`, and how many more Alle holds.
 *
 * @param {object[]} doneWeek  newest first (the store's `doneWeek`)
 * @param {number} [n]
 * @returns {{rows: object[], more: number}}
 */
export function doneShown(doneWeek, n = DONE_SHOWN) {
  return { rows: doneWeek.slice(0, n), more: Math.max(0, doneWeek.length - n) }
}
