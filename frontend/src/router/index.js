import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import InboxView from '../views/InboxView.vue'
import NextView from '../views/NextView.vue'
import WaitingView from '../views/WaitingView.vue'
import SomedayView from '../views/SomedayView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import AllTasksView from '../views/AllTasksView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/', redirect: '/inbox' },
  { path: '/inbox', component: InboxView },
  { path: '/next', component: NextView },
  { path: '/waiting', component: WaitingView },
  { path: '/someday', component: SomedayView },
  { path: '/projects', component: ProjectsView },
  { path: '/projects/:name', component: ProjectsView },
  { path: '/all', component: AllTasksView },
  { path: '/settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return '/login'
})

export default router
