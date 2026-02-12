import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getStorageItem, setStorageItem } from '../base/vtixGlobal'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeStyle = 'card' | 'paper'

const STORAGE_KEY = 'vtixThemeMode'
const STYLE_STORAGE_KEY = 'vtixThemeStyle'
const TRANSITION_CLASS = 'theme-animate'
const TRANSITION_DURATION_MS = 200

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('system')
  const style = ref<ThemeStyle>('card')
  const resolvedMode = ref<'light' | 'dark'>('light')
  let mediaQuery: MediaQueryList | null = null
  let mediaHandler: (() => void) | null = null
  let transitionTimer: number | null = null

  const isDark = computed(() => resolvedMode.value === 'dark')

  function applyResolved(next: 'light' | 'dark') {
    resolvedMode.value = next
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
  }

  function applyStyle(next: ThemeStyle) {
    const root = document.documentElement
    if (next === 'card') {
      root.removeAttribute('data-theme-style')
      return
    }
    root.dataset.themeStyle = next
  }

  function startTransition() {
    const root = document.documentElement
    root.classList.add(TRANSITION_CLASS)
    if (transitionTimer) {
      window.clearTimeout(transitionTimer)
    }
    transitionTimer = window.setTimeout(() => {
      root.classList.remove(TRANSITION_CLASS)
      transitionTimer = null
    }, TRANSITION_DURATION_MS)
  }

  function resolveMode(next: ThemeMode) {
    if (next === 'dark') {
      applyResolved('dark')
      return
    }
    if (next === 'light') {
      applyResolved('light')
      return
    }
    const prefersDark = mediaQuery?.matches ?? window.matchMedia('(prefers-color-scheme: dark)').matches
    applyResolved(prefersDark ? 'dark' : 'light')
  }

  function setMode(next: ThemeMode) {
    mode.value = next
    setStorageItem(STORAGE_KEY, next)
    startTransition()
    resolveMode(next)
  }

  function setStyle(next: ThemeStyle) {
    style.value = next
    setStorageItem(STYLE_STORAGE_KEY, next)
    startTransition()
    applyStyle(next)
  }

  function init() {
    const saved = getStorageItem(STORAGE_KEY) as ThemeMode | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      mode.value = saved
    }
    const savedStyle = getStorageItem(STYLE_STORAGE_KEY) as ThemeStyle | null
    if (savedStyle === 'card' || savedStyle === 'paper') {
      style.value = savedStyle
    }
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaHandler = () => {
      if (mode.value === 'system') {
        startTransition()
        resolveMode('system')
      }
    }
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', mediaHandler)
    } else {
      mediaQuery.addListener(mediaHandler)
    }
    resolveMode(mode.value)
    applyStyle(style.value)
  }

  function cleanup() {
    if (mediaQuery && mediaHandler) {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', mediaHandler)
      } else {
        mediaQuery.removeListener(mediaHandler)
      }
    }
  }

  return {
    mode,
    style,
    resolvedMode,
    isDark,
    setMode,
    setStyle,
    init,
    cleanup
  }
})
