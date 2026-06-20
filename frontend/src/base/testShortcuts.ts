import { getStorageItem, setStorageItem } from './vtixGlobal'

export const TEST_SHORTCUT_STORAGE_KEY = 'vtixTestShortcuts'

export const TEST_SHORTCUT_ACTIONS = [
  'choice0',
  'choice1',
  'choice2',
  'choice3',
  'choice4',
  'choice5',
  'submit',
  'prev',
  'next',
  'exit'
] as const

export type TestShortcutAction = (typeof TEST_SHORTCUT_ACTIONS)[number]
export type TestShortcutMap = Record<TestShortcutAction, string>

export const DEFAULT_TEST_SHORTCUTS: TestShortcutMap = {
  choice0: 'q',
  choice1: 'w',
  choice2: 'e',
  choice3: 'r',
  choice4: 't',
  choice5: 'y',
  submit: 'enter',
  prev: 'arrowleft',
  next: 'arrowright',
  exit: 'escape'
}

const RESERVED_KEYS = new Set(['alt', 'control', 'meta', 'shift'])
const KEY_LABELS: Record<string, string> = {
  enter: 'Enter',
  escape: 'Esc',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  space: 'Space'
}

function normalizeKeyValue(value: unknown) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  if (!normalized || RESERVED_KEYS.has(normalized)) return ''
  return normalized === 'spacebar' ? ' ' : normalized
}

export function normalizeShortcutEventKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return ''
  return normalizeKeyValue(event.key)
}

export function getShortcutDisplayLabel(key: string) {
  const normalized = normalizeKeyValue(key)
  if (!normalized) return '未设置'
  return KEY_LABELS[normalized] ?? (normalized.length === 1 ? normalized.toUpperCase() : normalized)
}

function isValidShortcutMap(value: unknown): value is Partial<TestShortcutMap> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sanitizeShortcutMap(candidate: unknown): TestShortcutMap | null {
  if (!isValidShortcutMap(candidate)) return null
  const next = {} as TestShortcutMap
  const used = new Set<string>()

  for (const action of TEST_SHORTCUT_ACTIONS) {
    const raw = candidate[action] ?? DEFAULT_TEST_SHORTCUTS[action]
    const key = normalizeKeyValue(raw)
    if (!key || used.has(key)) return null
    next[action] = key
    used.add(key)
  }

  return next
}

export function getTestShortcuts(): TestShortcutMap {
  const raw = getStorageItem(TEST_SHORTCUT_STORAGE_KEY)
  if (!raw) return { ...DEFAULT_TEST_SHORTCUTS }

  try {
    const parsed = JSON.parse(raw) as unknown
    return sanitizeShortcutMap(parsed) ?? { ...DEFAULT_TEST_SHORTCUTS }
  } catch {
    return { ...DEFAULT_TEST_SHORTCUTS }
  }
}

export function saveTestShortcuts(shortcuts: TestShortcutMap) {
  const sanitized = sanitizeShortcutMap(shortcuts)
  if (!sanitized) return false
  return setStorageItem(TEST_SHORTCUT_STORAGE_KEY, JSON.stringify(sanitized))
}

export function getShortcutActionForEvent(event: KeyboardEvent, shortcuts = getTestShortcuts()) {
  const key = normalizeShortcutEventKey(event)
  if (!key) return null
  return TEST_SHORTCUT_ACTIONS.find((action) => shortcuts[action] === key) ?? null
}
