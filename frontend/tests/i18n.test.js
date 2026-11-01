import { afterEach, describe, expect, it, vi } from 'vitest'

import { t } from '../src/shared/i18n.js'

afterEach(() => vi.restoreAllMocks())

describe('t()', () => {
  it('returns the German text and fills placeholders', () => {
    expect(t('list.next')).toBe('Nächste')
    expect(t('row.check', { d: 'Rosen schneiden' })).toBe('Abhaken: Rosen schneiden')
    expect(t('lens.cap', { done: 0, total: 7 })).toBe('0 von 7 heute')
  })

  it('shows a day given as {day} the way rows show days', () => {
    expect(t('filed.waitingOn', { day: '2026-11-06' })).toBe('Warten auf · nachhaken Fr 06.11.')
  })

  it('leaves a placeholder empty when its value is missing, and keeps the rest', () => {
    expect(t('row.check', {})).toBe('Abhaken: ')
  })

  it('a missing key shows as the key and is reported in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(t('no.such.key')).toBe('no.such.key')
    expect(error).toHaveBeenCalledWith('i18n: missing key no.such.key')
  })

  it('does not take a key from the object prototype', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(t('constructor')).toBe('constructor')
    expect(t('toString')).toBe('toString')
  })

  it('fills every part of a structured value and hands out a copy', () => {
    expect(t('stack.q.projctx', { p: 'Garten' })).toEqual(['Erste Aktion für Garten · ', 'wo erledigst du das?', ''])
    expect(t('stack.keys.step', { n: 3 })).toEqual([['1–3', 'wählen'], ['0 oder Esc', 'zurück']])
    const heading = t('h.next')
    heading[1] = 'changed'
    expect(t('h.next')).toEqual(['Was jetzt ', 'zählt', ''])
  })

  it('says Erledigt and Gelöscht without the row text, as Android pins them', () => {
    expect([t('notice.done'), t('notice.deleted'), t('notice.captured'), t('undo')]).toEqual([
      'Erledigt',
      'Gelöscht',
      'In Inbox ✓',
      'Rückgängig',
    ])
  })
})
