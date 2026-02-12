export type VtixStorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function isStorageLike(value: unknown): value is VtixStorageLike {
  if (!value || typeof value !== 'object') return false
  const target = value as Record<string, unknown>
  return (
    typeof target.getItem === 'function' &&
    typeof target.setItem === 'function' &&
    typeof target.removeItem === 'function'
  )
}

export function getVtixStorage() {
  if (typeof window === 'undefined') return null
  const storage = window.vtixGlobal?.storage
  return isStorageLike(storage) ? storage : null
}

export function getVtixPlatform() {
  if (typeof window === 'undefined') return 'web'
  const platform = window.vtixGlobal?.platform
  return typeof platform === 'string' && platform.trim() ? platform : 'web'
}

export function isStorageAvailable() {
  if (typeof window === 'undefined') return false
  const declared = window.vtixGlobal?.storageAvailable
  if (typeof declared === 'boolean') return declared
  return probeStorage()
}

export function getStorageItem(key: string) {
  const storage = getVtixStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function setStorageItem(key: string, value: string) {
  const storage = getVtixStorage()
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStorageItem(key: string) {
  const storage = getVtixStorage()
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function probeStorage() {
  const storage = getVtixStorage()
  if (!storage) return false
  if (window.vtixGlobal?.storageAvailable === false) return false
  const testKey = '__vtix_storage_probe__'
  try {
    storage.setItem(testKey, '1')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}
