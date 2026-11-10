import { createRouter, createWebHistory } from 'vue-router'
import { rememberUi } from '../shared/uiFlag.js'
import { pick } from './pick.js'
import LoginView from '../views/LoginView.vue'
import InboxView from '../views/InboxView.vue'
import NextView from '../views/NextView.vue'
import WaitingView from '../views/WaitingView.vue'
import SomedayView from '../views/SomedayView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import AllTasksView from '../views/AllTasksView.vue'
import SettingsView from '../views/SettingsView.vue'

// Every route has an old and a new side (ADR 0042). Until a new page lands, both sides are
// the old view, so ?ui=neu renders exactly what the old UI renders.
const routes = [
  { path: '/login', ...pick(LoginView, LoginView), meta: { public: true } },
  { path: '/', redirect: '/inbox' },
  { path: '/inbox', ...pick(InboxView, InboxView) },
  { path: '/next', ...pick(NextView, NextView) },
  { path: '/waiting', ...pick(WaitingView, WaitingView) },
  { path: '/someday', ...pick(SomedayView, SomedayView) },
  { path: '/projects', ...pick(ProjectsView, ProjectsView) },
  { path: '/projects/:name', ...pick(ProjectsView, ProjectsView) },
  { path: '/all', ...pick(AllTasksView, AllTasksView) },
  { path: '/settings', ...pick(SettingsView, SettingsView) },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  // Before the auth check, so a choice made on a URL that redirects to /login is kept.
  rememberUi(to.query.ui)
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return '/login'
})

export default router
