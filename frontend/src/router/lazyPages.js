import { defineAsyncComponent } from 'vue'

/**
 * The new UI's pages that are chunks of their own (plan M13, brief 0060): the entry's 130 kB
 * gzip budget while both UIs ship has no room for whole pages. The placeholder that Einstellungen
 * and Rückblick show until M14 is one too, and so is the login page: signing in needs the network
 * anyway, and a signed-in browser never shows it. The router renders them through
 * `pick()` like every other page; `NewUiHost.vue` fetches them in idle time once the new UI is
 * up, so they open offline and after a redeploy replaced the hashed chunks.
 *
 * Reached only through `import()`: an index blind spot (BLIND-FE-002), so `./run impact` on a
 * page here names no dependent. Its one user is `router/index.js`.
 */

const loadProjectsPage = () => import('../projects/ProjectsPage.vue')
const loadProjectPage = () => import('../projects/ProjectPage.vue')
const loadComingPage = () => import('../layout/ComingPage.vue')
const loadLoginPage = () => import('../identity/LoginPage.vue')

export const ProjectsPage = defineAsyncComponent(loadProjectsPage)
export const ProjectPage = defineAsyncComponent(loadProjectPage)
export const ComingPage = defineAsyncComponent(loadComingPage)
export const LoginPage = defineAsyncComponent(loadLoginPage)

/**
 * Fetch the lazy pages a signed-in browser shows; a failure is left to the navigation that needs
 * the page. The login page is not among them: it is reached by a full load after a session ends.
 */
export function prefetchPages() {
  for (const load of [loadProjectsPage, loadProjectPage, loadComingPage]) load().catch(() => {})
}
