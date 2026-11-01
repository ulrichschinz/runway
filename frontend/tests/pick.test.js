import { describe, expect, it } from 'vitest'

import { pick } from '../src/router/pick.js'

// Plain objects stand in for components: pick() only places them, it never renders them, so
// nothing here mounts anything (ADR 0007).
const OldInbox = { name: 'OldInbox' }
const NewInbox = { name: 'NewInbox' }
const OldProjects = { name: 'OldProjects' }
const NewProjects = { name: 'NewProjects' }

describe('pick', () => {
  // The invariant the old UI's behaviour rests on (ADR 0042, Decision 2): Vue keeps a route's
  // component when the next route renders the same type. /projects and /projects/:name both
  // render ProjectsView today, so a wrapper per route would remount it on that navigation.
  it('gives every route the same wrapper component, so the inner view decides reuse', () => {
    const inbox = pick(OldInbox, NewInbox)
    const projects = pick(OldProjects, NewProjects)
    const projectsByName = pick(OldProjects, NewProjects)

    expect(inbox.component).toBe(projects.component)
    expect(projects.component).toBe(projectsByName.component)
    expect(inbox.component.name).toBe('UiPick')
  })

  it('passes the two sides as the route props, old as alt and new as neu', () => {
    const route = pick(OldInbox, NewInbox)

    expect(Object.keys(route).sort()).toEqual(['component', 'props'])
    expect(route.props).toEqual({ alt: OldInbox, neu: NewInbox })
    expect(route.props.alt).toBe(OldInbox)
    expect(route.props.neu).toBe(NewInbox)
  })
})
