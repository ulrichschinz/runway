<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
    <!-- Sidebar (desktop) -->
    <aside class="hidden sm:flex flex-col w-56 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 fixed inset-y-0">
      <div class="px-4 py-5 border-b dark:border-gray-700">
        <div class="flex items-center gap-2 mb-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28" class="shrink-0">
            <g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55">
              <line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/>
              <line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/>
              <line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/>
              <line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/>
              <line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/>
              <line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/>
            </g>
            <circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/>
            <circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/>
            <circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/>
            <circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19" r="2" fill="#F4C84A"/>
          </svg>
          <h1 class="sidebar-wordmark">Runway</h1>
        </div>
        <router-link to="/settings" class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          {{ auth.username }}
        </router-link>
      </div>
      <nav class="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        <NavItem to="/inbox" icon="📥">Inbox</NavItem>
        <NavItem to="/next" icon="⚡">Next Actions</NavItem>
        <NavItem to="/waiting" icon="⏳">Waiting For</NavItem>
        <NavItem to="/someday" icon="💭">Someday / Maybe</NavItem>
        <NavItem to="/projects" icon="📁">Projects</NavItem>
        <NavItem to="/all" icon="📋">All Tasks</NavItem>

        <template v-if="taskStore.contextTags.length">
          <div class="pt-3 pb-1 px-2">
            <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Context</span>
          </div>
          <button
            v-for="ctx in taskStore.contextTags"
            :key="ctx"
            @click="taskStore.setContext(ctx)"
            :class="taskStore.activeContext === ctx ? 'ctx-active' : 'ctx-inactive'"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left"
          >
            <span class="text-xs">@</span>{{ ctx.slice(1) }}
            <span v-if="taskStore.activeContext === ctx" class="ml-auto text-xs ctx-close">×</span>
          </button>
        </template>
      </nav>
      <div class="px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between">
        <button @click="auth.logout(); $router.push('/login')" class="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Sign out</button>
        <div class="flex items-center gap-2">
          <router-link to="/settings" title="Settings" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
          </router-link>
          <button @click="toggleDark()" :title="isDark ? 'Light mode' : 'Dark mode'" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-base leading-none">
            {{ isDark ? '☀️' : '🌙' }}
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile top bar -->
    <div class="sm:hidden fixed top-0 inset-x-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center px-4 h-14">
      <button @click="mobileOpen = !mobileOpen" class="p-1 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 mr-3">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div class="flex items-center gap-2 flex-1">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="24" height="24" class="shrink-0">
          <g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55">
            <line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/>
            <line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/>
            <line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/>
            <line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/>
            <line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/>
            <line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/>
          </g>
          <circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/>
          <circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/>
          <circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/>
          <circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19" r="2" fill="#F4C84A"/>
        </svg>
        <h1 class="sidebar-wordmark">Runway</h1>
      </div>
      <button @click="toggleDark()" :title="isDark ? 'Light mode' : 'Dark mode'" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-base">
        {{ isDark ? '☀️' : '🌙' }}
      </button>
    </div>

    <!-- Mobile drawer -->
    <div v-if="mobileOpen" class="sm:hidden fixed inset-0 z-40 flex">
      <div class="absolute inset-0 bg-black/40" @click="mobileOpen = false" />
      <aside class="relative z-10 w-64 bg-white dark:bg-gray-800 flex flex-col h-full">
        <div class="px-4 py-5 border-b dark:border-gray-700 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="24" height="24" class="shrink-0">
              <g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55">
                <line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/>
                <line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/>
                <line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/>
                <line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/>
                <line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/>
                <line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/>
              </g>
              <circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/>
              <circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/>
              <circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/>
              <circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19" r="2" fill="#F4C84A"/>
            </svg>
            <h1 class="sidebar-wordmark">Runway</h1>
          </div>
          <button @click="mobileOpen = false" class="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <nav class="flex-1 px-2 py-4 space-y-1">
          <NavItem to="/inbox" icon="📥" @click="mobileOpen = false">Inbox</NavItem>
          <NavItem to="/next" icon="⚡" @click="mobileOpen = false">Next Actions</NavItem>
          <NavItem to="/waiting" icon="⏳" @click="mobileOpen = false">Waiting For</NavItem>
          <NavItem to="/someday" icon="💭" @click="mobileOpen = false">Someday / Maybe</NavItem>
          <NavItem to="/projects" icon="📁" @click="mobileOpen = false">Projects</NavItem>
          <NavItem to="/all" icon="📋" @click="mobileOpen = false">All Tasks</NavItem>

          <template v-if="taskStore.contextTags.length">
            <div class="pt-3 pb-1 px-2">
              <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Context</span>
            </div>
            <button
              v-for="ctx in taskStore.contextTags"
              :key="ctx"
              @click="taskStore.setContext(ctx); mobileOpen = false"
              :class="taskStore.activeContext === ctx ? 'ctx-active' : 'ctx-inactive'"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left"
            >
              <span class="text-xs">@</span>{{ ctx.slice(1) }}
              <span v-if="taskStore.activeContext === ctx" class="ml-auto text-xs ctx-close">×</span>
            </button>
          </template>
        </nav>
        <div class="px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between">
          <button @click="auth.logout(); $router.push('/login')" class="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Sign out</button>
          <router-link to="/settings" @click="mobileOpen = false" title="Settings" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
          </router-link>
        </div>
      </aside>
    </div>

    <!-- Main content -->
    <div class="flex-1 sm:ml-56 pt-14 sm:pt-0 flex flex-col min-h-screen">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useTaskStore } from '../stores/tasks.js'
import { useDarkMode } from '../composables/useDarkMode.js'
import NavItem from './NavItem.vue'

const auth = useAuthStore()
const taskStore = useTaskStore()
const mobileOpen = ref(false)
const { isDark, toggleDark } = useDarkMode()

onMounted(() => taskStore.fetchContextTags())
</script>

<style scoped>
.sidebar-wordmark {
  font-family: var(--ar-font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--ar-plum);
  letter-spacing: -0.01em;
}

.ctx-active {
  background: color-mix(in srgb, var(--ar-coral) 12%, transparent);
  color: var(--ar-plum);
  font-weight: 500;
}

.ctx-inactive {
  color: #4b5563;
}

.ctx-inactive:hover {
  background: #f3f4f6;
}

.ctx-close {
  color: var(--ar-coral);
}

:global(.dark) .ctx-inactive {
  color: #9ca3af;
}

:global(.dark) .ctx-inactive:hover {
  background: #374151;
}

:global(.dark) .sidebar-wordmark {
  color: #e2d9f3;
}
</style>
