import { ref } from 'vue'

const stored = localStorage.getItem('theme')
// The system preference is deliberately NOT consulted: the app defaults to light
// mode regardless (commit cb707b4). The matchMedia probe that used to live here was
// dead from that commit onward.
const isDark = ref(stored ? stored === 'dark' : false)

// Keep the browser UI (status bar / address bar) in sync with the theme.
// Mobile top bar is white in light mode, gray-800 in dark mode.
function applyThemeColor(dark) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#1F2937' : '#FFFFFF')
}

document.documentElement.classList.toggle('dark', isDark.value)
applyThemeColor(isDark.value)

export function useDarkMode() {
  function toggleDark() {
    isDark.value = !isDark.value
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', isDark.value)
    applyThemeColor(isDark.value)
  }
  return { isDark, toggleDark }
}
