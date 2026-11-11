import { createRouter, createWebHistory } from 'vue-router'
import { UI_NEW, currentUi, rememberUi } from '../shared/uiFlag.js'
import { loginRedirect } from '../shared/returnPath.js'
import { pick } from './pick.js'
import LoginView from '../views/LoginView.vue'
import InboxView from '../views/InboxView.vue'
import NextView from '../views/NextView.vue'
import WaitingView from '../views/WaitingView.vue'
import SomedayView from '../views/SomedayView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import AllTasksView from '../views/AllTasksView.vue'
import SettingsView from '../views/SettingsView.vue'
import AllPage from '../tasks/views/AllPage.vue'
import InboxPage from '../tasks/views/InboxPage.vue'
import NextPage from '../tasks/views/NextPage.vue'
import SomedayPage from '../tasks/views/SomedayPage.vue'
import WaitingPage from '../tasks/views/WaitingPage.vue'
import { ComingPage, LoginPage, ProjectPage, ProjectsPage } from './lazyPages.js'

// Every route has an old and a new side (ADR 0042). The new side is the placeholder page until
// the milestone that builds the view lands (brief 0050); the five lists landed with brief 0051, the
// projects with brief 0060 (lazily, `lazyPages.js`). `meta.view` names the view for the new shell's rail and dock.
const routes = [
  { path: '/login', ...pick(LoginView, LoginPage), meta: { public: true } },
  { path: '/', redirect: '/inbox' },
  { path: '/inbox', ...pick(InboxView, InboxPage), meta: { view: 'inbox' } },
  { path: '/next', ...pick(NextView, NextPage), meta: { view: 'next' } },
  { path: '/waiting', ...pick(WaitingView, WaitingPage), meta: { view: 'waiting' } },
  { path: '/someday', ...pick(SomedayView, SomedayPage), meta: { view: 'someday' } },
  { path: '/projects', ...pick(ProjectsView, ProjectsPage), meta: { view: 'projects' } },
  { path: '/projects/:name', ...pick(ProjectsView, ProjectPage), meta: { view: 'project' } },
  { path: '/all', ...pick(AllTasksView, AllPage), meta: { view: 'all' } },
  { path: '/settings', ...pick(SettingsView, ComingPage), meta: { view: 'settings' } },
  // New UI only: the old UI has no Rückblick, and the guard sends it to the Inbox.
  { path: '/review', ...pick(InboxView, ComingPage), meta: { view: 'review', newOnly: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  // Before the auth check, so a choice made on a URL that redirects to /login is kept.
  rememberUi(to.query.ui)
  const token = localStorage.getItem('token')
  // The visited path rides along (`?next=`), so the new login page can return there (F19).
  if (!to.meta.public && !token) return loginRedirect(to.fullPath)
  // Here rather than on the record: a record's beforeEnter skips query-only navigations.
  if (to.meta.newOnly && currentUi(to.query.ui) !== UI_NEW) return '/inbox'
})

export default router
