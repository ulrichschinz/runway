<template>
  <AppShell>
    <div class="max-w-2xl mx-auto px-4 py-8 space-y-6">

      <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100">Account</h2>

      <!-- Profile -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Profile</h3>
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-lg">
            {{ auth.username?.[0]?.toUpperCase() }}
          </div>
          <div>
            <p class="font-medium text-gray-800 dark:text-gray-100">{{ auth.username }}</p>
            <p class="text-sm text-gray-400">Runway account</p>
          </div>
        </div>
      </div>

      <!-- API Key -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">API Key</h3>
        <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">
          Use this key to authenticate via <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">X-Api-Key</code> header or with the MCP server — no login required.
        </p>

        <div v-if="apiKey" class="space-y-3">
          <div class="flex items-center gap-2">
            <code class="flex-1 block bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-200 overflow-x-auto"
              >{{ revealed ? apiKey : '•'.repeat(32) }}</code
            >
            <button @click="revealed = !revealed" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" :title="revealed ? 'Hide' : 'Reveal'">
              <svg v-if="!revealed" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
            </button>
            <button @click="copyKey" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Copy">
              <svg v-if="!copied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              <svg v-else class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </button>
          </div>

          <div class="flex items-center gap-3">
            <button v-if="!confirmRegen" @click="confirmRegen = true"
              class="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400">
              Regenerate key…
            </button>
            <template v-else>
              <span class="text-sm text-red-500">Regenerate? The old key will stop working immediately.</span>
              <button @click="doRegenerate" class="text-sm font-medium text-red-600 hover:text-red-800 dark:hover:text-red-400">Confirm</button>
              <button @click="confirmRegen = false" class="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            </template>
          </div>
        </div>

        <p v-else class="text-sm text-gray-400">Loading…</p>
      </div>

      <!-- MCP Setup -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">MCP Server</h3>
        <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">
          Connect any MCP-compatible client to Runway. The server is available at <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">/mcp</code>.
        </p>

        <!-- Tabs -->
        <div class="flex gap-1 mb-3 border-b border-gray-100 dark:border-gray-700">
          <button v-for="t in tabs" :key="t"
            @click="activeTab = t"
            class="px-3 py-1.5 text-sm rounded-t"
            :class="activeTab === t
              ? 'text-indigo-600 border-b-2 border-indigo-500 font-medium'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'">
            {{ t }}
          </button>
        </div>

        <div class="relative">
          <pre class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-4 text-xs font-mono text-gray-700 dark:text-gray-200 overflow-x-auto whitespace-pre">{{ snippets[activeTab] }}</pre>
          <button @click="copySnippet" class="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded" title="Copy">
            <svg v-if="!snippetCopied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            <svg v-else class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          </button>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">Replace <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://your-host</code> with your Runway URL.</p>
      </div>

    </div>
  </AppShell>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppShell from '../components/AppShell.vue'
import { useAuthStore } from '../stores/auth.js'
import client from '../api/client.js'

const auth = useAuthStore()
const apiKey = ref(null)
const revealed = ref(false)
const copied = ref(false)
const confirmRegen = ref(false)
const snippetCopied = ref(false)
const activeTab = ref('Claude Desktop')
const tabs = ['Claude Desktop', 'Claude Code', 'curl']

onMounted(async () => {
  const { data } = await client.get('/auth/apikey')
  apiKey.value = data.api_key
})

async function doRegenerate() {
  const { data } = await client.post('/auth/apikey/regenerate')
  apiKey.value = data.api_key
  revealed.value = true
  confirmRegen.value = false
}

function copyKey() {
  navigator.clipboard.writeText(apiKey.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function copySnippet() {
  navigator.clipboard.writeText(snippets.value[activeTab.value])
  snippetCopied.value = true
  setTimeout(() => (snippetCopied.value = false), 2000)
}

const snippets = computed(() => {
  const key = apiKey.value ?? '<your-api-key>'
  return {
    'Claude Desktop': `{
  "mcpServers": {
    "runway": {
      "type": "sse",
      "url": "https://your-host/mcp",
      "headers": {
        "X-Api-Key": "${key}"
      }
    }
  }
}`,
    'Claude Code': `{
  "mcpServers": {
    "runway": {
      "type": "sse",
      "url": "https://your-host/mcp",
      "headers": {
        "X-Api-Key": "${key}"
      }
    }
  }
}`,
    'curl': `# Add task to inbox
curl -X POST https://your-host/api/inbox \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"description": "My task", "priority": "H"}'

# List pending tasks
curl https://your-host/api/tasks \\
  -H "X-Api-Key: ${key}"`,
  }
})
</script>
