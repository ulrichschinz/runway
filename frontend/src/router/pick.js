import { defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'
import { UI_NEW, currentUi } from '../shared/uiFlag.js'

/**
 * Renders one side of a route: the old view or the new page, as `shared/uiFlag.js` decides.
 *
 * Every route shares this one component on purpose. Vue keeps a route's component when the
 * next route renders the same type (today `/projects` and `/projects/:name` both render
 * ProjectsView), and a wrapper per route would turn that reuse into a remount. With one
 * wrapper the inner component decides, exactly as RouterView did before (ADR 0042).
 *
 * The render reads `route.query.ui`, so a navigation that only changes the query renders the
 * other side; the router guard has stored the choice by then.
 *
 * Route guards: vue-router reads options-API guards (`beforeRouteEnter/Update/Leave`) off the
 * route's component, which is this wrapper, so on a view or page behind pick() they never run.
 * Use `onBeforeRouteLeave` / `onBeforeRouteUpdate` in setup (they register on the matched route
 * and are removed on unmount), or a `beforeEnter` on the route record.
 */
const UiPick = defineComponent({
  name: 'UiPick',
  props: {
    alt: { type: [Object, Function], required: true },
    neu: { type: [Object, Function], required: true },
  },
  setup(props) {
    const route = useRoute()
    return () => h(currentUi(route.query.ui) === UI_NEW ? props.neu : props.alt)
  },
})

/**
 * The `component` and `props` of a route that has an old and a new side.
 * Both are imported statically by the router, so the index keeps every router → view edge.
 *
 * @param {object} OldView  the component the old UI renders for this route
 * @param {object} NewPage  the component the new UI renders for it
 */
export function pick(OldView, NewPage) {
  return { component: UiPick, props: { alt: OldView, neu: NewPage } }
}
