import { describe, expect, it } from 'vitest'

import messages from '../src/shared/messages.de.js'
import { DOCK_TABS, LISTS, MORE_ITEMS, PLACES, dockKeyOf, navKeyOf } from '../src/shared/navigation.js'

describe('navigation', () => {
  it('has the dock tabs Inbox · Nächste · Warten auf in that order (m3, pinned on Android)', () => {
    expect(DOCK_TABS.map((item) => messages[item.label])).toEqual(['Inbox', 'Nächste', 'Warten auf'])
  })

  it('puts every view that is not a tab into the Mehr sheet, once', () => {
    const all = [...LISTS, ...PLACES].map((item) => item.key)
    const reachable = [...DOCK_TABS, ...MORE_ITEMS].map((item) => item.key)
    expect(reachable.sort()).toEqual(all.sort())
    expect(MORE_ITEMS.map((item) => item.key)).toEqual(['projects', 'someday', 'review', 'all', 'settings'])
  })

  it('gives every entry a path and an existing label', () => {
    for (const item of [...LISTS, ...PLACES]) {
      expect(item.to).toBe(`/${item.key}`)
      expect(messages[item.label]).toBeTypeOf('string')
    }
  })

  it('marks Projekte for a project page and nothing for an unknown view', () => {
    expect(navKeyOf('project')).toBe('projects')
    expect(navKeyOf('review')).toBe('review')
    expect(navKeyOf('nope')).toBeNull()
    expect(navKeyOf(undefined)).toBeNull()
  })

  it('marks ··· for every view that is not a tab', () => {
    expect(dockKeyOf('inbox')).toBe('inbox')
    expect(dockKeyOf('waiting')).toBe('waiting')
    for (const view of ['projects', 'project', 'someday', 'review', 'all', 'settings', undefined]) {
      expect(dockKeyOf(view)).toBe('more')
    }
  })
})
