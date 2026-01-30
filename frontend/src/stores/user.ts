import { defineStore } from 'pinia'

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

function recordLoginTimestamp() {
  if (!window.localStorage) return
  const last = localStorage.getItem(LAST_LOGIN_KEY)
  if (last) {
    localStorage.setItem(PREV_LOGIN_KEY, last)
  }
  localStorage.setItem(LAST_LOGIN_KEY, String(Date.now()))
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
        const data = (await response.json()) as { user: User }
        this.user = data.user
        recordLoginTimestamp()
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '登录失败'
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
