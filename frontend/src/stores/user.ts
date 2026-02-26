import { defineStore } from 'pinia'
import { getStorageItem, getVtixStorage, setStorageItem } from '../base/vtixGlobal'
import {
  getSyncAt,
  getSyncCursor,
  setSyncAt,
  setSyncCursor,
  syncRecords
} from '../base/recordSync'
import {
  readPracticeRecords,
  upsertPracticeRecords
} from '../base/practiceRecords'

export type User = {
  id: string
  name: string
  email: string
  groupId: string
  groupName: string
  permissions: number
  privateProblemSetLimit: number
  recordCloudLimit: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const LAST_LOGIN_KEY = 'vtixLastLoginAt'
const PREV_LOGIN_KEY = 'vtixPrevLoginAt'
let recordSyncing = false
let recordSyncPromise: Promise<void> | null = null

type PracticeRecord = {
  id: string
  updatedAt?: number
  deletedAt?: number
  [key: string]: unknown
}

function recordLoginTimestamp() {
  const last = getStorageItem(LAST_LOGIN_KEY)
  if (last) {
    setStorageItem(PREV_LOGIN_KEY, last)
  }
  setStorageItem(LAST_LOGIN_KEY, String(Date.now()))
}

function readLocalRecords(): PracticeRecord[] {
  return readPracticeRecords<PracticeRecord>({ includeDeleted: true })
}

async function syncPracticeRecordsOnce(cloudLimit?: number) {
  if (recordSyncing) {
    if (recordSyncPromise) {
      await recordSyncPromise
    }
    return
  }
  const storage = getVtixStorage()
  if (!storage) return
  recordSyncing = true
  recordSyncPromise = (async () => {
    try {
      const localRecords = readLocalRecords()
      const previousCursor = getSyncCursor(storage)
      const since = localRecords.length ? previousCursor : 0
      const localSince = getSyncAt(storage)
      const maxRecords = Number.isFinite(Number(cloudLimit)) ? Number(cloudLimit) : undefined
      const result = await syncRecords<PracticeRecord>({
        apiBase,
        localRecords,
        since,
        localSince,
        credentials: 'include',
        maxRecords,
        trimLocal: false
      })
      if (result.remoteRecords.length > 0) {
        upsertPracticeRecords(result.remoteRecords)
      }
      setSyncCursor(storage, result.cursor)
      setSyncAt(storage, Date.now())
    } catch (error) {
      console.warn('[vtix] auto sync records failed', error)
    } finally {
      recordSyncing = false
      recordSyncPromise = null
    }
  })()
  await recordSyncPromise
}

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as User | null,
    loading: false,
    error: ''
  }),
  actions: {
    async loadCurrentUser() {
      this.loading = true
      this.error = ''
      try {
        const response = await fetch(`${apiBase}/api/me`, {
          credentials: 'include'
        })
        const data = (await response.json()) as { user: User | null }
        this.user = data.user ?? null
      } catch (error) {
        this.user = null
        this.error = error instanceof Error ? error.message : '加载失败'
      } finally {
        this.loading = false
      }
    },
    async login(payload: { email?: string; name?: string; password?: string }) {
      this.loading = true
      this.error = ''
      try {
        const response = await fetch(`${apiBase}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
        const data = (await response.json().catch(() => null)) as
          | { user?: User; error?: string }
          | null
        if (!response.ok) {
          this.error = data?.error || `登录失败: ${response.status}`
          return false
        }
        if (!data?.user) {
          this.error = '登录失败'
          return false
        }
        this.user = data.user
        recordLoginTimestamp()
        void syncPracticeRecordsOnce(this.user?.recordCloudLimit)
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '登录失败'
        return false
      } finally {
        this.loading = false
      }
    },
    async register(payload: { name?: string; email?: string; password?: string }) {
      this.loading = true
      this.error = ''
      try {
        const response = await fetch(`${apiBase}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
        const data = (await response.json().catch(() => null)) as
          | { user?: User; error?: string }
          | null
        if (!response.ok) {
          this.error = data?.error || `注册失败: ${response.status}`
          return false
        }
        if (!data?.user) {
          this.error = '注册失败'
          return false
        }
        this.user = data.user
        recordLoginTimestamp()
        void syncPracticeRecordsOnce(this.user?.recordCloudLimit)
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '注册失败'
        return false
      } finally {
        this.loading = false
      }
    },
    async logout() {
      this.loading = true
      this.error = ''
      try {
        if (this.user) {
          await syncPracticeRecordsOnce(this.user.recordCloudLimit)
        }
        await fetch(`${apiBase}/api/logout`, {
          method: 'POST',
          credentials: 'include'
        })
      } catch (error) {
        this.error = error instanceof Error ? error.message : '退出失败'
      } finally {
        this.user = null
        this.loading = false
      }
    },
    async updateProfile(payload: { name?: string; email?: string }) {
      this.loading = true
      this.error = ''
      try {
        const response = await fetch(`${apiBase}/api/me`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
        if (!response.ok) {
          throw new Error(`保存失败: ${response.status}`)
        }
        const data = (await response.json()) as { user: User }
        this.user = data.user
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '保存失败'
        return false
      } finally {
        this.loading = false
      }
    }
  }
})
