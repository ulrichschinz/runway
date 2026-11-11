import { ref } from 'vue'

/**
 * What the list pages remember while the app is open, never stored (06 `ui.ctx`,
 * `ui.showDone`): coming back to Nächste keeps its chip, a reload starts at Alle.
 */

/** Nächste's context filter: null (Alle), `'@x'`, or `NO_CONTEXT`. */
export const contextFilter = ref(null)

/** Alle shows the done of the last seven days. */
export const showDone = ref(false)

/** The Rückblick's steps ticked by hand (06 `ui.reviewChecked`): kept while going into a list and back. */
export const reviewChecked = ref(new Set())
