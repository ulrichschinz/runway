<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
    <!-- Sidebar (desktop) -->
    <aside class="hidden sm:flex flex-col w-56 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 fixed inset-y-0">
      <div class="px-4 py-5 border-b dark:border-gray-700">
        <h1 class="text-lg font-bold text-indigo-600">Runway</h1>
        <router-link to="/settings" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
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
      <h1 class="font-bold text-indigo-600 flex-1">Runway</h1>
      <button @click="toggleDark()" :title="isDark ? 'Light mode' : 'Dark mode'" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-base">
        {{ isDark ? '☀️' : '🌙' }}
      </button>
    </div>

    <!-- Mobile drawer -->
    <div v-if="mobileOpen" class="sm:hidden fixed inset-0 z-40 flex">
      <div class="absolute inset-0 bg-black/40" @click="mobileOpen = false" />
      <aside class="relative z-10 w-64 bg-white dark:bg-gray-800 flex flex-col h-full">
        <div class="px-4 py-5 border-b dark:border-gray-700 flex items-center justify-between">
          <h1 class="text-lg font-bold text-indigo-600">Runway</h1>
          <button @click="mobileOpen = false" class="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <nav class="flex-1 px-2 py-4 space-y-1">
          <NavItem to="/inbox" icon="📥" @click="mobileOpen = false">Inbox</NavItem>
          <NavItem to="/next" icon="⚡" @click="mobileOpen = false">Next Actions</NavItem>
          <NavItem to="/waiting" icon="⏳" @click="mobileOpen = false">Waiting For</NavItem>
          <NavItem to="/someday" icon="💭" @click="mobileOpen = false">Someday / Maybe</NavItem>
          <NavItem to="/projects" icon="📁" @click="mobileOpen = false">Projects</NavItem>
          <NavItem to="/all" icon="📋" @click="mobileOpen = false">All Tasks</NavItem>
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
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useDarkMode } from '../composables/useDarkMode.js'
import NavItem from './NavItem.vue'

const auth = useAuthStore()
const mobileOpen = ref(false)
const { isDark, toggleDark } = useDarkMode()
</script>
