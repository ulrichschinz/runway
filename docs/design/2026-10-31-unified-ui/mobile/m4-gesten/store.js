// m4 Gesten: data and list rules for the phone prototype.
// Derived from shared/data/tasks.js (not edited). Maps the demo contexts onto Android's preset
// (@home @computer @work @business) and adds two follow-up days so Warten auf shows "Nachhaken".

import { TASKS, tagParts, parseTw } from '../../shared/data/tasks.js'

export const CHIPS = ['@home', '@computer', '@work', '@business', 'Alle'] // contract order (P08, P09)
export const TODAY = '20261031'
export const NOW = '09:41'

// demo context -> Android preset (documented in README "Mock data")
export const CTX_MAP = {
  '@computer': '@computer',
  '@anrufe': '@business', // calls with customers, suppliers, tax office
  '@zuhause': '@home',
  '@unterwegs': '@home', // private errands
  '@buero': '@work',
}
const FOLLOW = { // derived follow-up days (API: scheduled on a +waiting task)
  'Feedback von Nora zum Logo-Entwurf': '20261030T080000Z',
  'Unterschrift Pilotkunde': '20261107T080000Z',
}

export const day = (v) => (v ? v.slice(0, 8) : null)
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export function dm(v) { const d = parseTw(v); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.` }
export function wdm(v) { return `${WD[parseTw(v).getUTCDay()]} ${dm(v)}` }

export function mapContext(c) {
  if (!c || c === 'Alle') return null
  return CHIPS.includes(c) ? c : (CTX_MAP[c] || null)
}

export class Store {
  constructor() {
    this.tasks = TASKS.map((t) => {
      const parts = tagParts(t)
      const ctx = [...new Set(parts.filter((p) => p.startsWith('@')).map((p) => CTX_MAP[p] || p))]
      let kind = 'inbox'
      if (t.status === 'completed') kind = 'done'
      else if (parts.includes('waiting')) kind = 'waiting'
      else if (parts.includes('someday')) kind = 'someday'
      else if (ctx.length) kind = 'next'
      else if (t.project) kind = 'project'
      return { ...t, ctx, kind, scheduled: FOLLOW[t.description] || t.scheduled, out: null, local: false, gone: false }
    })
    this.calls = []
    this.seq = 0
    this.hold = null // the one write held for 6 s (Android outbox: done and delete)
  }

  get(id) { return this.tasks.find((t) => t.id === Number(id)) }
  byText(text) { return this.tasks.find((t) => t.description.startsWith(text)) }

  lists(filter) {
    const open = this.tasks.filter((t) => t.status === 'pending' && !t.gone)
    const inbox = open.filter((t) => t.kind === 'inbox').sort((a, b) => b.entry.localeCompare(a.entry))
    const due = open.filter((t) => t.due && day(t.due) <= TODAY).sort((a, b) => a.due.localeCompare(b.due))
    const dueIds = new Set(due.map((t) => t.id))
    // lenient Android rule: the context, or no context at all; due items only in "Fällig"
    const next = open.filter((t) => t.kind === 'next' && !dueIds.has(t.id) && (!filter || t.ctx.length === 0 || t.ctx.includes(filter)))
      .sort((a, b) => b.urgency - a.urgency)
    const waiting = open.filter((t) => t.kind === 'waiting').sort((a, b) => {
      const fa = a.scheduled ? day(a.scheduled) : '99999999'
      const fb = b.scheduled ? day(b.scheduled) : '99999999'
      return fa.localeCompare(fb)
    })
    return { inbox, due, next, waiting }
  }

  counts() {
    const l = this.lists(null)
    return { inbox: l.inbox.length, due: l.due.length }
  }

  capture(text, out = null) {
    const clean = String(text).replace(/\s+/g, ' ').trim()
    if (!clean) return null
    this.seq += 1
    const n = 900 + this.seq
    const t = {
      id: n, uuid: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`, description: clean, status: 'pending',
      project: null, tags: [], ctx: [], kind: 'inbox', priority: null, due: null, scheduled: null, wait: null,
      urgency: 1, entry: `20261031T0941${String(10 + this.seq).padStart(2, '0')}Z`, start: null, annotations: [],
      out, local: !!out, gone: false,
    }
    this.tasks.push(t)
    this.calls.push(`POST /inbox {"description":"${clean}"}`)
    return t
  }

  // done and delete are held 6 s (the API cannot reopen or undelete)
  holdWrite(kind, ids) {
    this.flush()
    ids.forEach((id) => { this.get(id).gone = true })
    this.hold = { kind, ids }
  }
  flush() {
    if (!this.hold) return
    const { kind, ids } = this.hold
    ids.forEach((id) => {
      const t = this.get(id)
      if (kind === 'done') { t.status = 'completed'; this.calls.push(`POST /tasks/${t.uuid}/done`) }
      else { t.status = 'deleted'; this.calls.push(`DELETE /tasks/${t.uuid}`) }
    })
    this.hold = null
  }
  undo() {
    if (!this.hold) return false
    this.hold.ids.forEach((id) => { this.get(id).gone = false })
    this.hold = null
    return true
  }
  undoCapture(id) {
    const t = this.get(id)
    if (t) { t.status = 'deleted'; this.calls.push(`DELETE /tasks/${t.uuid} (Rückgängig)`) }
  }

  // Option only (needs Uli's decision): quick clarify from the Inbox
  clarify(id, to) {
    const t = this.get(id)
    if (!t) return null
    if (to === 'delete') { this.holdWrite('delete', [t.id]); return 'Gelöscht' }
    const prev = { kind: t.kind, ctx: t.ctx }
    if (to.startsWith('next:')) {
      const c = mapContext(to.slice(5)) || '@computer'
      t.kind = 'next'; t.ctx = [c]
      this.calls.push(`PUT /tasks/${t.uuid} {"tags_add":["next","${c}"]}`)
      return { label: `Nächste · ${c}`, prev }
    }
    if (to === 'waiting') { t.kind = 'waiting'; this.calls.push(`PUT /tasks/${t.uuid} {"tags_add":["waiting"]}`); return { label: 'Warten auf', prev } }
    if (to === 'someday') { t.kind = 'someday'; this.calls.push(`PUT /tasks/${t.uuid} {"tags_add":["someday"]}`); return { label: 'Irgendwann', prev } }
    return null
  }
}

export function statusOf(t, list) {
  if (list === 'inbox') return t.out || 'Inbox'
  if (list === 'waiting') return t.scheduled && day(t.scheduled) <= TODAY ? 'Nachhaken fällig' : 'Wartet'
  if (t.due && day(t.due) < TODAY) return 'überfällig'
  if (t.due && day(t.due) === TODAY) return 'fällig heute'
  return 'Nächste'
}
