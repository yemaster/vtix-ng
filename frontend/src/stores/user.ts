import { defineStore } from 'pinia'
import {
  getSyncAt,
  getSyncCursor,
  setSyncAt,
  setSyncCursor,
  syncRecords
} from '../base/recordSync'

export type User = {
  id: string
  name: string
  email: string
  groupId: string
  groupName: string
  permissions: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const LAST_LOGIN_KEY = 'vtixLastLoginAt'
const PREV_LOGIN_KEY = 'vtixPrevLoginAt'
const RECORDS_KEY = 'vtixSave'
let recordSyncing = false

type PracticeRecord = {
  id: string
  updatedAt?: number
  deletedAt?: number
  [key: string]: unknown
}

function recordLoginTimestamp() {
  if (!window.localStorage) return
  const last = localStorage.getItem(LAST_LOGIN_KEY)
  if (last) {
    localStorage.setItem(PREV_LOGIN_KEY, last)
  }
  localStorage.setItem(LAST_LOGIN_KEY, String(Date.now()))
}

function readLocalRecords(): PracticeRecord[] {
  if (!window.localStorage) return []
  const raw = localStorage.getItem(RECORDS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.id === 'string')
  } catch {
    return []
  }
}

function writeLocalRecords(list: PracticeRecord[]) {
  if (!window.localStorage) return
  localStorage.setItem(RECORDS_KEY, JSON.stringify(list))
}

async function syncPracticeRecordsOnce() {
  if (recordSyncing) return
  if (!window.localStorage) return
  recordSyncing = true
  try {
    const localRecords = readLocalRecords()
    const previousCursor = getSyncCursor(localStorage)
    const since = localRecords.length ? previousCursor : 0
    const localSince = getSyncAt(localStorage)
    const result = await syncRecords<PracticeRecord>({
      apiBase,
      localRecords,
      since,
      localSince,
      credentials: 'include'
    })
    if (result.localChanged) {
      writeLocalRecords(result.finalRecords)
    }
    setSyncCursor(localStorage, result.cursor)
    setSyncAt(localStorage, Date.now())
  } catch (error) {
    console.warn('[vtix] auto sync records failed', error)
  } finally {
    recordSyncing = false
  }
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
        void syncPracticeRecordsOnce()
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
        void syncPracticeRecordsOnce()
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
