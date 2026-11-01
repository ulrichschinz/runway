// Pure GTD rules of proposal 03: which list a todo is in, and what a list move sends to the API.
// No DOM, no state. In the real apps this file becomes frontend/src/shared/listMoves.js (tested in
// frontend/tests/, as frontend/AGENTS.md asks for pure rules) and kt/gtd/ListMoves.kt on Android.
//
// The lists follow the server (api/app/services/task_service.py, inventory 1.2):
//   Inbox    = no tags at all and no project
//   Nächste  = +next (and, in this client, not also +waiting or +someday)
//   Warten   = +waiting          Irgendwann = +someday
//   anything else is "ohne Liste": in a project only, or a context without a status tag
//
// List moves never send the full tag set. They send PUT /tasks/{uuid} with tags_add / tags_remove,
// so a context or any other tag on the todo survives, and a legacy comma tag is repaired, not lost.

import { tagParts, contextsOf } from '../shared/data/tasks.js'

export const STATUS_TAGS = ['next', 'waiting', 'someday']
export const has = (t, tag) => tagParts(t).includes(tag)
export const isWaiting = (t) => has(t, 'waiting')
export const isSomeday = (t) => has(t, 'someday')
export const isNext = (t) => has(t, 'next') && !isWaiting(t) && !isSomeday(t)
export const isInbox = (t) => !t.project && tagParts(t).length === 0
export const listOf = (t) => isInbox(t) ? 'inbox' : isWaiting(t) ? 'waiting' : isSomeday(t) ? 'someday' : isNext(t) ? 'next' : 'none'

/** Clarify an Inbox item: 'next' | 'next:@ctx' | 'waiting' | 'someday' | 'project:Name'. */
export function clarifyPayload(to) {
  const [kind, arg] = String(to).split(/:(.*)/s)
  if (kind === 'next') return { tags_add: arg ? ['next', arg] : ['next'] }
  if (kind === 'waiting') return { tags_add: ['waiting'] }
  if (kind === 'someday') return { tags_add: ['someday'] }
  if (kind === 'project') return { project: arg, tags_add: ['next'] }
  throw new Error(`unknown clarify target ${to}`)
}

/** Move between Nächste, Warten auf and Irgendwann: add the one status tag, remove the other two. */
export function listPayload(t, list) {
  if (!STATUS_TAGS.includes(list)) throw new Error(`not a list move: ${list}`)
  const raw = (tag) => t.tags.filter((x) => String(x).split(',').map((p) => p.trim()).includes(tag))
  return {
    tags_add: [list],
    tags_remove: STATUS_TAGS.filter((s) => s !== list).flatMap(raw),
  }
}

/** Toggle one context. Never touches next, waiting or someday. */
export function contextPayload(t, ctx) {
  if (!contextsOf(t).includes(ctx)) return { tags_add: [ctx] }
  const rawTag = t.tags.find((x) => String(x).split(',').map((p) => p.trim()).includes(ctx))
  if (rawTag === ctx) return { tags_remove: [ctx] }
  // legacy "@a,@b" tag: remove the raw tag, add back the parts that stay (repairs the tag)
  const keep = String(rawTag).split(',').map((p) => p.trim()).filter((p) => p && p !== ctx)
  return { tags_remove: [rawTag], tags_add: keep }
}

/** The inverse of a clarify, for Rückgängig: remove what was added, restore the project. */
export function inversePayload(before, body) {
  const out = {}
  const added = (body.tags_add || []).filter((tag) => !before.tags.includes(tag))
  if (added.length) out.tags_remove = added
  if ('project' in body && body.project !== before.project) out.project = before.project ?? ''
  return out
}

/** Apply a PUT body to a local copy the way the server does (used by the store and the tests). */
export function applyPayload(t, body) {
  const rm = new Set(body.tags_remove || [])
  const tags = t.tags.filter((x) => !rm.has(x))
  for (const tag of body.tags_add || []) if (!tags.includes(tag)) tags.push(tag)
  t.tags = tags
  if ('project' in body) t.project = body.project || null
  return t
}

/** Project names as the API accepts them (api/app/models.py:15-20). Returns a German message or ''. */
export function projectNameError(name, existing = []) {
  const n = String(name)
  if (!n.trim()) return 'Gib dem Projekt einen Namen.'
  if (n.length > 100) return 'Höchstens 100 Zeichen.'
  if (/[()"'\\:\/?#%\u0000-\u001f]/.test(n)) return 'Ohne diese Zeichen: ( ) " \' \\ : / ? # %'
  if (/^[+\- ]/.test(n) || / $/.test(n)) return 'Nicht mit + - oder Leerzeichen beginnen oder mit Leerzeichen enden.'
  if (['overview', 'plans'].includes(n.toLowerCase())) return 'Dieser Name ist reserviert.'
  if (existing.some((p) => p.toLowerCase() === n.toLowerCase())) return 'Dieses Projekt gibt es schon.'
  return ''
}
