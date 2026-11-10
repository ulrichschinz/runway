import { describe, expect, it } from 'vitest'

import { CAPS, GROUPS, matchRank, needleOf, rankPalette } from '../src/shared/paletteRank.js'

const cmd = (label, group = 'act') => ({ group, label })
const todo = (label, keywords = []) => ({ group: 'todo', label, keywords })
const proj = (label) => ({ group: 'proj', label })
const capture = (q) => ({ group: 'new', label: `Als Todo erfassen: „${q}“`, always: true })
const labels = (list) => list.map((x) => x.label)

describe('needleOf', () => {
  it('trims and lower-cases the query', () => {
    expect(needleOf('  Steuer ')).toBe('steuer')
    expect(needleOf('')).toBe('')
    expect(needleOf(null)).toBe('')
  })
})

describe('matchRank', () => {
  it('ranks the start before a word start before the inside, and -1 for no match', () => {
    expect(matchRank('Steuerberatung zurückrufen', 'steuer')).toBe(0)
    expect(matchRank('Belege für die Steuer', 'steuer')).toBe(1)
    expect(matchRank('Umsatzsteuer prüfen', 'steuer')).toBe(2)
    expect(matchRank('Garten', 'steuer')).toBe(-1)
  })

  it('counts a word start after punctuation and the @ of a context', () => {
    expect(matchRank('Umzugsfirma: Termin', 'termin')).toBe(1)
    expect(matchRank('Buero-Umzug', 'umzug')).toBe(1)
    expect(matchRank('@computer', 'computer')).toBe(1)
    expect(matchRank('Gehe zu „Nächste“', 'nächste')).toBe(1)
  })

  it('finds a later word start after an earlier inside match', () => {
    expect(matchRank('Bausteuer und Steuer', 'steuer')).toBe(1)
  })
})

describe('rankPalette', () => {
  const commands = [
    cmd('Neues Todo'), cmd('Abhaken: Belege Oktober hochladen'),
    cmd('Gehe zu Inbox', 'nav'), cmd('Gehe zu Nächste', 'nav'), cmd('Gehe zu Warten auf', 'nav'),
    cmd('Kontext @computer', 'ctx'), cmd('Darstellung: Dunkel', 'look'), cmd('Tastenkürzel', 'look'),
  ]

  it('lists every command and nothing else without a query, in group order', () => {
    const shuffled = [commands[6], commands[2], todo('Steuer'), commands[0], capture(''), commands[5]]
    expect(labels(rankPalette(shuffled, '  '))).toEqual(['Neues Todo', 'Gehe zu Inbox', 'Kontext @computer', 'Darstellung: Dunkel'])
    const many = Array.from({ length: 30 }, (_, i) => cmd(`Befehl ${i}`))
    expect(rankPalette(many, '')).toHaveLength(30)
  })

  it('keeps the groups in their order and the best match first inside one', () => {
    const items = [
      capture('steuer'), proj('Steuer-2025'),
      todo('Belege für die Steuer'), todo('Steuerberatung zurückrufen'), todo('Umsatzsteuer prüfen'),
      cmd('Gehe zu Steuer', 'nav'),
    ]
    expect(labels(rankPalette(items, 'steuer'))).toEqual([
      'Gehe zu Steuer', 'Steuerberatung zurückrufen', 'Belege für die Steuer', 'Umsatzsteuer prüfen',
      'Steuer-2025', 'Als Todo erfassen: „steuer“',
    ])
    expect(rankPalette(items, 'steuer').map((x) => x.group)).toEqual(['nav', 'todo', 'todo', 'todo', 'proj', 'new'])
    expect(GROUPS).toEqual(['act', 'nav', 'ctx', 'look', 'todo', 'proj', 'new'])
  })

  it('matches a keyword (project, tag) after every label match', () => {
    const items = [todo('Rosen schneiden', ['Garten', '@zuhause']), todo('Gartenschere kaufen', [])]
    expect(labels(rankPalette(items, 'garten'))).toEqual(['Gartenschere kaufen', 'Rosen schneiden'])
    expect(labels(rankPalette(items, '@zuhause'))).toEqual(['Rosen schneiden'])
  })

  it('keeps ties in the order given', () => {
    const items = [todo('Anruf Bank'), todo('Anruf Vermieter'), todo('Anruf Steuer')]
    expect(labels(rankPalette(items, 'anruf'))).toEqual(['Anruf Bank', 'Anruf Vermieter', 'Anruf Steuer'])
  })

  it('caps commands, todos and projects with a query, keeping the best of each', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => cmd(`x Gehe ${i}`, 'nav')), cmd('Gehe zu Inbox', 'nav'),
      ...Array.from({ length: 7 }, (_, i) => todo(`Gehe ${i}`)),
      ...Array.from({ length: 4 }, (_, i) => proj(`Gehen ${i}`)),
      capture('gehe'),
    ]
    const ranked = rankPalette(items, 'gehe')
    const count = (group) => ranked.filter((x) => x.group === group).length
    expect(count('nav')).toBe(CAPS.commands)
    expect(ranked[0].label).toBe('Gehe zu Inbox')
    expect(count('todo')).toBe(CAPS.todo)
    expect(count('proj')).toBe(CAPS.proj)
    expect(labels(ranked).at(-1)).toBe('Als Todo erfassen: „gehe“')
  })

  it('keeps "Als Todo erfassen" whatever the query, and shows only it when nothing matches', () => {
    expect(labels(rankPalette([...commands, capture('xyz')], 'xyz'))).toEqual(['Als Todo erfassen: „xyz“'])
  })

  it('is case-insensitive and ignores surrounding space', () => {
    expect(labels(rankPalette(commands, '  DUNKEL '))).toEqual(['Darstellung: Dunkel'])
  })
})
