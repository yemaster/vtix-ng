interface VtixGlobal {
  platform?: string
  storageAvailable?: boolean
  storage?: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  }
}

interface Window {
  vtixGlobal?: VtixGlobal
}

declare const __VTIX_BUILD_ID__: string
