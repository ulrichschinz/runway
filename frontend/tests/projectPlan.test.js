import { describe, expect, it } from 'vitest'

import {
  ideasToOrganized, moveItem, outcomeOf, planBody, planDirty, planEmpty, planFrom, withItem, withoutItem,
} from '../src/shared/projectPlan.js'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

describe('planFrom and planBody', () => {
  it('fills every field of a plan the API does not have yet', () => {
    expect(planFrom(null, ids())).toEqual({ purpose: '', principles: '', vision: '', brainstorm: [], organized: [] })
    expect(planFrom({ project_name: 'X', updated_at: null }, ids()).brainstorm).toEqual([])
  })

  it('keeps the stored items and gives one without an id an id', () => {
    const plan = planFrom({
      purpose: 'Kunden finden uns', brainstorm: [{ id: 'a', text: 'Logo' }, { text: 'Fotos' }, null, { id: 'b' }],
      organized: [{ id: 'o', text: 'Texte' }],
    }, ids())
    expect(plan.brainstorm).toEqual([{ id: 'a', text: 'Logo' }, { id: 'id1', text: 'Fotos' }])
    expect(plan.organized).toEqual([{ id: 'o', text: 'Texte' }])
  })

  it('sends all five fields and nothing else', () => {
    const plan = { ...planFrom({ vision: 'Live' }, ids()), brainstorm: [{ id: 'a', text: 'Logo', extra: 1 }] }
    expect(planBody(plan)).toEqual({
      purpose: '', principles: '', vision: 'Live', brainstorm: [{ id: 'a', text: 'Logo' }], organized: [],
    })
  })
})

describe('planDirty and planEmpty', () => {
  it('sees a change in a text, in an item and in the order', () => {
    const saved = planFrom({ purpose: 'A', organized: [{ id: '1', text: 'x' }, { id: '2', text: 'y' }] }, ids())
    expect(planDirty(saved, saved)).toBe(false)
    expect(planDirty({ ...saved, purpose: 'B' }, saved)).toBe(true)
    expect(planDirty({ ...saved, organized: moveItem(saved.organized, 0, 1) }, saved)).toBe(true)
    expect(planDirty({ ...saved, brainstorm: withItem([], 'neu', 'n') }, saved)).toBe(true)
  })

  it('reads a plan of blanks as empty, as the server’s has_plan does', () => {
    expect(planEmpty(planFrom({ purpose: '  ' }, ids()))).toBe(true)
    expect(planEmpty(planFrom({ brainstorm: [{ id: 'a', text: 'x' }] }, ids()))).toBe(false)
  })
})

describe('the list edits', () => {
  const list = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]

  it('adds a trimmed item at the end and refuses a blank one', () => {
    expect(withItem(list, '  D ', 'd').at(-1)).toEqual({ id: 'd', text: 'D' })
    expect(withItem(list, '   ', 'd')).toBe(list)
  })

  it('removes by id', () => {
    expect(withoutItem(list, 'b').map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('moves one place and stays put at either end', () => {
    expect(moveItem(list, 1, -1).map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1).map((i) => i.id)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 2, 1)).toBe(list)
  })

  it('takes over the ideas not yet ordered, under new ids', () => {
    const next = ideasToOrganized([{ id: 'x', text: 'Logo' }, { id: 'y', text: 'Fotos ' }], [{ id: 'o', text: 'Fotos' }], ids())
    expect(next).toEqual([{ id: 'o', text: 'Fotos' }, { id: 'id1', text: 'Logo' }])
    const same = [{ id: 'o', text: 'Logo' }]
    expect(ideasToOrganized([{ id: 'x', text: 'Logo' }], same, ids())).toBe(same)
  })
})

describe('outcomeOf', () => {
  it('is the vision’s first line that says something', () => {
    expect(outcomeOf({ vision: '\n  Die Seite ist live.\nKunden finden alles.' })).toBe('Die Seite ist live.')
    expect(outcomeOf({ vision: '' })).toBe('')
    expect(outcomeOf(null)).toBe('')
  })
})
