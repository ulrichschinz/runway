import { describe, expect, it } from 'vitest'

import { NO_STEP } from '../src/shared/clarify.js'
import { NeedsAnswer, clarifyPayload } from '../src/shared/gtdRules.js'
import {
  KEYED_PROJECTS, TRAYS, needsStep, returnedCards, stackBack, stackKey, stackOrder, stackPick, stackQuestion, stackTrays, trayName,
  trayOfFiling,
} from '../src/shared/stackSteps.js'

// Saturday: "morgen" is the next working day, Monday 02.11.
const TODAY = '2026-10-31'
const CONTEXTS = ['@computer', '@anrufe', '@buero', '@unterwegs', '@zuhause', '@garten']
const PROJECTS = ['Garten', 'Website-Relaunch', 'Steuer 2026', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']
const sources = { contexts: CONTEXTS, projects: PROJECTS, today: TODAY }
const at = (step, project = null) => ({ step, project })

/**
 * Drive the stack with keys from the first question, as a person would: each key chooses a tray of
 * the trays shown for the current step. Returns the PUT body the store would send (or the
 * done / delete), or the step it stopped at.
 */
function walk(...keys) {
  let state = NO_STEP
  for (const key of keys) {
    const to = stackKey(state, key, stackTrays(state, sources))
    const result = to && stackPick(state, to)
    if (!result) return { stuck: key, state }
    if (result.state) state = result.state
    else {
      const { to: target, opts } = result.file
      if (target === 'done' || target === 'delete') return { held: target }
      return { body: clarifyPayload(target, opts) }
    }
  }
  return { state }
}

describe('the first question', () => {
  it('shows five trays, Nächste · Warten auf · Irgendwann · Erledigt · Löschen, keys 1–5, with their counts', () => {
    const trays = stackTrays(NO_STEP, sources, { lists: { next: 14, waiting: 4, someday: 3, done: 3 } })
    expect(trays.map((tr) => [tr.to, tr.key, tr.label, tr.n])).toEqual([
      ['next', '1', 'Nächste', 14], ['waiting', '2', 'Warten auf', 4], ['someday', '3', 'Irgendwann', 3],
      ['done', '4', 'Erledigt', 3], ['delete', '5', 'Löschen', null],
    ])
    expect(trays.map((tr) => tr.hint)).toEqual(['dann Kontext', 'dann Nachhaken', 'nicht jetzt', 'unter 2 Minuten', 'braucht keiner'])
    expect(TRAYS.map((tr) => tr.key)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('files Irgendwann, Erledigt and Löschen at once; Nächste, Warten auf and Projekt ask first', () => {
    expect(stackPick(NO_STEP, 'someday')).toEqual({ file: { to: 'someday', opts: {} } })
    expect(stackPick(NO_STEP, 'done')).toEqual({ file: { to: 'done', opts: {} } })
    expect(stackPick(NO_STEP, 'delete')).toEqual({ file: { to: 'delete', opts: {} } })
    expect(stackPick(NO_STEP, 'next')).toEqual({ state: at('ctx') })
    expect(stackPick(NO_STEP, 'waiting')).toEqual({ state: at('follow') })
    expect(stackPick(NO_STEP, 'project')).toEqual({ state: at('project') })
    expect(stackPick(NO_STEP, 'back')).toBe(null)
    expect(stackPick(NO_STEP, 'ctx:@computer')).toBe(null)
  })

  it('takes 1–5 and p, nothing else', () => {
    const trays = stackTrays(NO_STEP, sources)
    expect(['1', '2', '3', '4', '5', 'p'].map((k) => stackKey(NO_STEP, k, trays)))
      .toEqual(['next', 'waiting', 'someday', 'done', 'delete', 'project'])
    for (const k of ['0', '6', 'Escape', 'Backspace', 'n', 'a']) expect(stackKey(NO_STEP, k, trays), k).toBe(null)
  })
})

describe('a tray that needs an answer turns into the answers', () => {
  it('Nächste: every context, the first five keyed, mono, with its count; Zurück last on 0', () => {
    const trays = stackTrays(at('ctx'), sources, { contexts: { '@computer': 4, '@anrufe': 3 } })
    expect(trays.map((tr) => tr.to)).toEqual([...CONTEXTS.map((c) => `ctx:${c}`), 'back'])
    expect(trays.map((tr) => tr.key)).toEqual(['1', '2', '3', '4', '5', null, '0'])
    expect(trays.slice(0, 2).map((tr) => tr.n)).toEqual([4, 3])
    expect(trays[0].mono).toBe(true)
    expect(trays.at(-1)).toMatchObject({ label: 'Zurück', hint: 'anderes Fach' })
    // 06's hints under the known contexts; a context of the user's own has none (and no "ctxhint.garten")
    expect(trays.slice(0, 6).map((tr) => tr.hint)).toEqual(['am Rechner', 'Telefon', 'im Büro', 'unterwegs', 'daheim', ''])
  })

  it('Warten auf: morgen (Montag on a Saturday) · Freitag · nächste Woche · ohne Datum, keys 1–4', () => {
    const trays = stackTrays(at('follow'), sources)
    expect(trays.map((tr) => [tr.to, tr.key, tr.label])).toEqual([
      ['day:2026-11-02', '1', 'Montag'], ['day:2026-11-06', '2', 'Freitag'], ['day:2026-11-09', '3', 'nächste Woche'],
      ['day:', '4', 'ohne Datum'], ['back', '0', 'Zurück'],
    ])
  })

  it('Projekt: the active projects, the first eight keyed, "Neues Projekt" last on the next digit', () => {
    const trays = stackTrays(at('project'), sources, { projects: { Garten: 2 } })
    expect(trays.map((tr) => tr.to)).toEqual([...PROJECTS.map((p) => `proj:${p}`), 'newproj', 'back'])
    expect(trays.map((tr) => tr.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', null, null, '9', '0'])
    expect(trays[0].hint).toBe('2 nächste')
    expect(trays[1].hint).toBe('0 nächste')
    expect(KEYED_PROJECTS).toBe(8)
    const few = stackTrays(at('project'), { ...sources, projects: ['Garten', 'Haus'] })
    expect(few.map((tr) => [tr.to, tr.key])).toEqual([['proj:Garten', '1'], ['proj:Haus', '2'], ['newproj', '3'], ['back', '0']])
    const none = stackTrays(at('project'), { ...sources, projects: [] })
    expect(none.map((tr) => [tr.to, tr.key])).toEqual([['newproj', '1'], ['back', '0']])
  })

  it('a new project shows only Zurück beside its name field; the first action asks for the context', () => {
    expect(stackTrays(at('newproject'), sources).map((tr) => tr.to)).toEqual(['back'])
    expect(stackTrays(at('projctx', 'Garten'), sources).map((tr) => tr.to)).toEqual([...CONTEXTS.map((c) => `ctx:${c}`), 'back'])
  })

  it('offers the preset contexts to a user who has none yet', () => {
    const preset = stackTrays(at('ctx'), { ...sources, contexts: ['@home', '@computer', '@work', '@business'] })
    expect(preset.map((tr) => tr.label)).toEqual(['@home', '@computer', '@work', '@business', 'Zurück'])
  })
})

describe('tray → answer → payload (the same payloads as the clarify panel)', () => {
  it('Nächste then a context', () => {
    expect(walk('1', '2')).toEqual({ body: { tags_add: ['next', '@anrufe'] } })
    expect(stackPick(at('ctx'), 'ctx:@garten')).toEqual({ file: { to: 'next:@garten', opts: {} } })
  })

  it('Warten auf then a follow-up day, or none', () => {
    expect(walk('2', '2')).toEqual({ body: { tags_add: ['waiting'], scheduled: '2026-11-06' } })
    expect(walk('2', '4')).toEqual({ body: { tags_add: ['waiting'] } })
  })

  it('Irgendwann at once; Erledigt and Löschen go to the outbox hold', () => {
    expect(walk('3')).toEqual({ body: { tags_add: ['someday'] } })
    expect(walk('4')).toEqual({ held: 'done' })
    expect(walk('5')).toEqual({ held: 'delete' })
  })

  it('Projekt, a project, then its first action\'s context', () => {
    expect(walk('p', '3', '1')).toEqual({ body: { project: 'Steuer 2026', tags_add: ['next', '@computer'] } })
    expect(stackPick(at('project'), 'proj:P10')).toEqual({ state: at('projctx', 'P10') })
    expect(stackPick(at('projctx', 'P10'), 'ctx:@zuhause')).toEqual({ file: { to: 'project:P10', opts: { ctx: '@zuhause' } } })
  })

  it('Projekt, Neues Projekt (its digit, or n): the name field', () => {
    expect(walk('p', '9')).toEqual({ state: at('newproject') })
    expect(walk('p', 'n')).toEqual({ state: at('newproject') })
    expect(stackPick(at('project'), 'newproj')).toEqual({ state: at('newproject') })
  })

  it('a digit without a tray, or a tray of another step, does nothing', () => {
    expect(walk('2', '5')).toEqual({ stuck: '5', state: at('follow') })
    expect(walk('1', '6')).toEqual({ stuck: '6', state: at('ctx') })
    expect(stackPick(at('ctx'), 'day:2026-11-02')).toBe(null)
    expect(stackPick(at('follow'), 'ctx:@computer')).toBe(null)
    expect(stackPick(at('ctx'), 'next')).toBe(null)
    expect(stackPick(at('project'), 'proj:')).toBe(null)
    expect(stackPick(at('newproject'), 'newproj')).toBe(null)
  })
})

describe('Zurück', () => {
  it('goes back with 0, Esc and ⌫ from every step: from a project\'s context or a new name to the projects', () => {
    for (const key of ['0', 'Escape', 'Backspace']) {
      expect(walk('1', key), key).toEqual({ state: NO_STEP })
      expect(walk('2', key), key).toEqual({ state: NO_STEP })
      expect(walk('p', key), key).toEqual({ state: NO_STEP })
      expect(walk('p', '1', key), key).toEqual({ state: at('project') })
      expect(walk('p', '9', key), key).toEqual({ state: at('project') })
    }
    expect(stackPick(at('projctx', 'Garten'), 'back')).toEqual({ state: at('project') })
    expect(stackBack(at('ctx'))).toEqual(NO_STEP)
  })

  it('after Zurück the first question takes its keys again', () => {
    expect(walk('1', '0', '3')).toEqual({ body: { tags_add: ['someday'] } })
  })
})

describe('NeedsAnswer → the step that asks it', () => {
  it('a missing context opens the context question (for a project its first action\'s)', () => {
    let error
    try {
      clarifyPayload('next:')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(NeedsAnswer)
    expect(needsStep(error.what)).toEqual(at('ctx'))
    expect(needsStep('context', at('projctx', 'Garten'))).toEqual(at('projctx', 'Garten'))
  })

  it('leaves anything else to the detail', () => {
    expect(needsStep('legacyTag')).toBe(null)
  })
})

describe('the order of the cards', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('is the Inbox\'s order; a skipped card goes to the bottom, in the order of the skips', () => {
    expect(stackOrder(ids)).toEqual(ids)
    expect(stackOrder(ids, ['a'])).toEqual(['b', 'c', 'd', 'a'])
    expect(stackOrder(ids, ['a', 'b'])).toEqual(['c', 'd', 'a', 'b'])
  })

  it('puts a pinned card on top (back from its tray)', () => {
    expect(stackOrder(ids, [], 'c')).toEqual(['c', 'a', 'b', 'd'])
    expect(stackOrder(ids, ['c'], 'c')).toEqual(['c', 'a', 'b', 'd'])
  })

  it('keeps the card on top while it is in the Inbox: a new capture goes under it', () => {
    // 'a' was on top; 'n' arrives newest (a capture from the phone, a refresh)
    expect(stackOrder(['n', ...ids], [], [null, 'a'])).toEqual(['a', 'n', 'b', 'c', 'd'])
    // a card back from its tray wins over the kept one
    expect(stackOrder(['n', ...ids], [], ['c', 'a'])).toEqual(['c', 'n', 'a', 'b', 'd'])
    // the kept card was filed: the Inbox's own order again
    expect(stackOrder(['n', 'b', 'c'], [], [null, 'a'])).toEqual(['n', 'b', 'c'])
  })

  it('follows a capture to the uuid the server gave it', () => {
    const uuidNow = (id) => ({ 'local:1': 'x' })[id] ?? id
    const now = ['x', 'a', 'b']
    // skipped while it was local: it stays at the bottom once named
    expect(stackOrder(now, ['local:1'], null, uuidNow)).toEqual(['a', 'b', 'x'])
    // kept or pinned while it was local: it stays on top
    expect(stackOrder(['b', 'a', 'x'], [], [null, 'local:1'], uuidNow)).toEqual(['x', 'b', 'a'])
    expect(stackOrder(['b', 'a', 'x'], [], ['local:1'], uuidNow)).toEqual(['x', 'b', 'a'])
  })

  it('forgets cards that left the Inbox', () => {
    expect(stackOrder(['b', 'c'], ['a', 'b'], 'x')).toEqual(['c', 'b'])
    expect(stackOrder([], ['a'], 'a')).toEqual([])
  })
})

describe('the cards Rückgängig brought back', () => {
  const history = [{ uuid: 'a', tray: 'next' }, { uuid: 'local:1', tray: 'done' }, { uuid: 'c', tray: 'someday' }]

  it('are those back in the Inbox; the rest stay out', () => {
    expect(returnedCards(history, ['c', 'z'])).toEqual({
      back: [{ uuid: 'c', tray: 'someday' }], out: [{ uuid: 'a', tray: 'next' }, { uuid: 'local:1', tray: 'done' }],
    })
    expect(returnedCards(history, ['z']).back).toEqual([])
  })

  it('know a capture back under the uuid the server gave it', () => {
    const uuidNow = (id) => ({ 'local:1': 'x' })[id] ?? id
    expect(returnedCards(history, ['x'], uuidNow).back).toEqual([{ uuid: 'x', tray: 'done' }])
    expect(returnedCards(history, ['x']).back).toEqual([])
  })
})

describe('what screen readers hear', () => {
  it('names the trays after the question above them', () => {
    expect(stackQuestion(at(null)).join('')).toBe('Was ist es?')
    expect(stackQuestion(at('ctx')).join('')).toBe('Nächste · wo erledigst du das?')
    expect(stackQuestion(at('follow')).join('')).toBe('Warten auf · wann fragst du nach?')
    expect(stackQuestion(at('project')).join('')).toBe('Zu welchem Projekt?')
    expect(stackQuestion(at('projctx', 'Garten')).join('')).toBe('Erste Aktion für Garten · wo erledigst du das?')
  })

  it('names a tray with what it shows — its name, hint and count — and its key', () => {
    const [next] = stackTrays(at(null), sources, { lists: { next: 12 } })
    expect(trayName(next)).toBe('Nächste, dann Kontext, 12 darin (Taste 1)')
    const friday = stackTrays(at('follow'), sources).find((tr) => tr.key === '2')
    expect(trayName(friday)).toBe(`${friday.label}, ${friday.hint} (Taste 2)`)
    expect(friday.hint).toMatch(/\d/)
    const garden = stackTrays(at('project'), sources, { projects: { Garten: 3 } })[0]
    expect(trayName(garden)).toBe('Garten, 3 nächste (Taste 1)')
    expect(trayName({ label: 'Zehntes', hint: '', n: null, key: null })).toBe('Zehntes')
  })
})

describe('the tray a filed card comes back out of', () => {
  it('is the first question\'s tray', () => {
    expect(trayOfFiling('ctx:@computer')).toBe('next')
    expect(trayOfFiling('day:2026-11-02')).toBe('waiting')
    expect(trayOfFiling('day:')).toBe('waiting')
    expect(trayOfFiling('someday')).toBe('someday')
    expect(trayOfFiling('done')).toBe('done')
    expect(trayOfFiling('delete')).toBe('delete')
  })
})
