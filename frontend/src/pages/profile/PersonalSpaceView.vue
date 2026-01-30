<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'

type PracticeRecord = {
  id: string
  testId: string
  testTitle?: string
  updatedAt: number
  practiceMode: number
  progress: {
    timeSpentSeconds?: number
    currentProblemId?: number
    problemList?: unknown[]
    submittedList?: boolean[]
    answerList?: unknown[]
  }
  problemState?: number[]
}

type QuestionBankItem = {
  id: number | string
  code: string
  title: string
  year: number
  categories: string[]
  questionCount: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const userStore = useUserStore()
const router = useRouter()
const route = useRoute()

type SpaceTab = {
  label: string
  value?: 'profile' | 'practice' | 'banks'
  route?: { name: string }
}

const tabs: SpaceTab[] = [
  { label: '个人信息', value: 'profile' },
  { label: '练习情况', value: 'practice' },
  { label: '我的题库', value: 'banks' },
  { label: '做题记录', route: { name: 'records' } },
  { label: '错题管理', route: { name: 'wrong-problems' } }
]
const activeTab = ref('profile')

const tabItems = tabs.map((tab) => ({
  label: tab.label,
  command: () => {
    if (tab.value) {
      activeTab.value = tab.value
      return
    }
    if (tab.route) {
      router.push(tab.route)
    }
  }
}))

const lastLoginAt = ref<number | null>(null)
const prevLoginAt = ref<number | null>(null)

const LAST_LOGIN_KEY = 'vtixLastLoginAt'
const PREV_LOGIN_KEY = 'vtixPrevLoginAt'

const routeName = computed(() => {
  const raw = route.params.name
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
})

const displayName = computed(() => routeName.value || userStore.user?.name || '学习者')

const isSelf = computed(() => {
  const currentName = userStore.user?.name
  if (!currentName || !routeName.value) return false
  return currentName === routeName.value
})

function loadLoginInfo() {
  if (!isSelf.value) {
    lastLoginAt.value = null
    prevLoginAt.value = null
    return
  }
  const last = Number(localStorage.getItem(LAST_LOGIN_KEY))
  const prev = Number(localStorage.getItem(PREV_LOGIN_KEY))
  lastLoginAt.value = Number.isFinite(last) && last > 0 ? last : null
  prevLoginAt.value = Number.isFinite(prev) && prev > 0 ? prev : null
}

function formatTimestamp(value?: number | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const loginInfoText = computed(() => ({
  current: isSelf.value ? formatTimestamp(lastLoginAt.value) : '对外已隐藏',
  previous: isSelf.value
    ? prevLoginAt.value
      ? formatTimestamp(prevLoginAt.value)
      : '首次登录'
    : '对外已隐藏'
}))

const records = ref<PracticeRecord[]>([])

function readRecords(): PracticeRecord[] {
  if (!window.localStorage) return []
  const raw = localStorage.getItem('vtixSave')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.id === 'string')
  } catch (error) {
    return []
  }
}

function getRecordAnsweredCount(record: PracticeRecord) {
  if (Array.isArray(record.problemState)) {
    return record.problemState.filter((state) => state > 0).length
  }
  const submitted = record.progress?.submittedList
  if (Array.isArray(submitted)) {
    return submitted.filter(Boolean).length
  }
  const answerList = record.progress?.answerList
  if (Array.isArray(answerList)) {
    return answerList.filter((answer) => Array.isArray(answer) && answer.length > 0).length
  }
  const current = record.progress?.currentProblemId ?? -1
  const total = record.progress?.problemList?.length ?? 0
  return Math.min(Math.max(0, current + 1), total)
}

function syncPractice() {
  records.value = isSelf.value ? readRecords() : []
}

const chartDays = computed(() => {
  const days: { key: string; label: string; answered: number; minutes: number }[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`
    const label = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
    days.push({ key, label, answered: 0, minutes: 0 })
  }
  return days
})

const aggregatedDays = computed(() => {
  const map = new Map(chartDays.value.map((day) => [day.key, { ...day }]))
  records.value.forEach((record) => {
    const date = new Date(record.updatedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`
    const target = map.get(key)
    if (!target) return
    target.minutes += Math.round((record.progress.timeSpentSeconds ?? 0) / 60)
    target.answered += getRecordAnsweredCount(record)
  })
  return Array.from(map.values())
})

const maxMinutes = computed(() => Math.max(1, ...aggregatedDays.value.map((day) => day.minutes)))
const maxAnswered = computed(() => Math.max(1, ...aggregatedDays.value.map((day) => day.answered)))

const totalAnswered = computed(() =>
  records.value.reduce((sum, record) => sum + getRecordAnsweredCount(record), 0)
)
const totalMinutes = computed(() =>
  Math.round(records.value.reduce((sum, record) => sum + (record.progress.timeSpentSeconds ?? 0), 0) / 60)
)
const totalRecords = computed(() => records.value.length)

const banks = ref<QuestionBankItem[]>([])
const banksLoading = ref(false)
const banksError = ref('')

async function loadBanks() {
  if (!routeName.value) return
  banksLoading.value = true
  banksError.value = ''
  try {
    const response = await fetch(
      isSelf.value ? `${apiBase}/api/my-problem-sets` : `${apiBase}/api/problem-sets`,
      isSelf.value
        ? {
            credentials: 'include'
          }
        : undefined
    )
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as QuestionBankItem[]
    const normalized = Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          categories: Array.isArray(item.categories) ? item.categories : [],
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0
        }))
      : []
    if (isSelf.value) {
      banks.value = normalized
    } else {
      const target = routeName.value.trim().toLowerCase()
      banks.value = normalized.filter(
        (item) => String((item as any).creatorName ?? '').trim().toLowerCase() === target
      )
    }
  } catch (error) {
    banksError.value = error instanceof Error ? error.message : '加载失败'
    banks.value = []
  } finally {
    banksLoading.value = false
  }
}

watch(
  () => [userStore.user?.id, routeName.value],
  () => {
    loadLoginInfo()
    syncPractice()
    if (activeTab.value === 'banks') {
      void loadBanks()
    }
  }
)

watch(activeTab, (value) => {
  if (value === 'banks') {
    void loadBanks()
  }
})

onMounted(() => {
  loadLoginInfo()
  syncPractice()
})
</script>

<template>
  <section class="space-page">
    <header class="space-hero">
      <div class="hero-info">
        <div class="hero-eyebrow">个人空间</div>
        <h1>欢迎回来，{{ displayName }}</h1>
        <p>跟进学习节奏与练习表现，汇总数据洞察，持续优化题库建设。</p>
        <div v-if="!isSelf" class="hero-note">访客视图 · 仅展示公开题库与基础资料</div>
        <div v-else class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-label">练习时长</div>
            <div class="hero-stat-value">{{ totalMinutes }} 分钟</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-label">完成题目</div>
            <div class="hero-stat-value">{{ totalAnswered }} 题</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-label">记录次数</div>
            <div class="hero-stat-value">{{ totalRecords }} 次</div>
          </div>
        </div>
      </div>
    </header>

    <TabMenu class="space-tabs" :model="tabItems" />

    <section v-if="activeTab === 'profile'" class="tab-panel">
      <div class="panel-grid">
        <div class="panel-card">
          <div class="panel-head">
            <div class="panel-title">个人信息</div>
            <Button
              v-if="isSelf && userStore.user"
              label="编辑资料"
              size="small"
              severity="secondary"
              text
              @click="router.push({ name: 'user-edit', params: { name: userStore.user.name } })"
            />
          </div>
          <div v-if="!userStore.user && isSelf" class="panel-empty">
            <p>登录后即可查看个人资料与学习统计。</p>
            <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
          </div>
          <div v-else class="profile-stack">
            <div class="profile-summary">
              <div class="profile-avatar">{{ displayName.slice(0, 1) }}</div>
              <div class="profile-meta">
                <div class="profile-name">{{ displayName }}</div>
                <div class="profile-email">
                  {{ isSelf ? userStore.user?.email || '未填写邮箱' : '对外已隐藏' }}
                </div>
                <div class="profile-tags">
                  <Tag :value="isSelf ? userStore.user?.groupName || '未分组' : '访客'" rounded />
                  <Tag :value="isSelf ? 'Active' : 'Public'" :severity="isSelf ? 'success' : 'info'" rounded />
                </div>
              </div>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">用户名</div>
                <div class="info-value">{{ displayName }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">用户组</div>
                <div class="info-value">
                  {{ isSelf ? userStore.user?.groupName || '未分组' : '对外已隐藏' }}
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">本次登录</div>
                <div class="info-value">{{ loginInfoText.current }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">上次登录</div>
                <div class="info-value">{{ loginInfoText.previous }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel-card highlight">
        <div class="panel-title">学习概况</div>
        <div v-if="!isSelf" class="panel-empty">对外已隐藏</div>
        <div v-else class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">累计练习时长</div>
              <div class="summary-value">{{ totalMinutes }} 分钟</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">累计完成题目</div>
              <div class="summary-value">{{ totalAnswered }} 题</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">记录次数</div>
              <div class="summary-value">{{ totalRecords }} 次</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'practice'" class="tab-panel">
      <div v-if="!isSelf" class="panel-card panel-empty">
        <p>练习数据已对外隐藏。</p>
      </div>
      <div v-else class="chart-grid">
        <div class="panel-card">
          <div class="panel-title">近 7 天练习时长（分钟）</div>
          <div class="chart-bars">
            <div v-for="day in aggregatedDays" :key="`${day.key}-time`" class="chart-bar">
              <div
                class="bar-fill"
                :style="{ height: `${Math.round((day.minutes / maxMinutes) * 100)}%` }"
              ></div>
              <div class="bar-label">{{ day.label }}</div>
              <div class="bar-value">{{ day.minutes }}</div>
            </div>
          </div>
        </div>
        <div class="panel-card">
          <div class="panel-title">近 7 天完成题目数</div>
          <div class="chart-bars">
            <div v-for="day in aggregatedDays" :key="`${day.key}-count`" class="chart-bar">
              <div
                class="bar-fill accent"
                :style="{ height: `${Math.round((day.answered / maxAnswered) * 100)}%` }"
              ></div>
              <div class="bar-label">{{ day.label }}</div>
              <div class="bar-value">{{ day.answered }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'banks'" class="tab-panel">
      <div v-if="isSelf && !userStore.user" class="panel-card panel-empty">
        <p>登录后可查看你创建的题库。</p>
        <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
      </div>
      <div v-else-if="banksLoading" class="bank-grid">
        <div v-for="n in 4" :key="n" class="bank-card skeleton">
          <div class="skeleton-line lg"></div>
          <div class="skeleton-line sm"></div>
          <div class="skeleton-tags">
            <span class="skeleton-pill"></span>
            <span class="skeleton-pill"></span>
          </div>
        </div>
      </div>
      <div v-else-if="banksError" class="panel-card panel-empty">
        <p>{{ banksError }}</p>
        <Button label="重试" size="small" severity="secondary" text @click="loadBanks" />
      </div>
      <div v-else-if="banks.length === 0" class="panel-card panel-empty">
        <p>{{ isSelf ? '暂无已创建的题库。' : '该用户暂未公开题库。' }}</p>
        <Button
          v-if="isSelf"
          label="创建题库"
          size="small"
          @click="router.push({ name: 'admin-question-bank-create' })"
        />
      </div>
      <div v-else class="bank-grid">
        <div v-for="bank in banks" :key="bank.id" class="bank-card">
          <div class="bank-title">{{ bank.title }}</div>
          <div class="bank-meta">{{ bank.year }} 年 · {{ bank.questionCount }} 题</div>
          <div class="bank-tags">
            <Tag v-for="tag in bank.categories" :key="tag" :value="tag" rounded />
          </div>
          <Button
            label="编辑题库"
            size="small"
            severity="secondary"
            text
            @click="router.push({ name: 'admin-question-bank-edit', params: { code: bank.code } })"
          />
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.space-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
  position: relative;
  isolation: isolate;
  padding-bottom: 6px;
}

.space-page::before {
  content: '';
  position: absolute;
  inset: -40px 0 auto 20%;
  height: 220px;
  background: radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 70%);
  filter: blur(6px);
  z-index: -1;
}

.space-page::after {
  content: '';
  position: absolute;
  inset: 40px 10% auto auto;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(14, 165, 233, 0.16), transparent 72%);
  z-index: -1;
}

.space-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #e0f2fe 100%);
  border-radius: 20px;
  padding: 22px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  position: relative;
  overflow: hidden;
}

.space-hero::after {
  content: '';
  position: absolute;
  right: -60px;
  bottom: -80px;
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.25), transparent 70%);
  pointer-events: none;
}

.hero-info h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: #0f172a;
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.hero-info p {
  margin: 0;
  color: #475569;
}

.hero-note {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.hero-stats {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-stat {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  padding: 8px 12px;
  min-width: 120px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}

.hero-stat-label {
  font-size: 11px;
  color: #64748b;
}

.hero-stat-value {
  margin-top: 4px;
  font-weight: 800;
  color: #0f172a;
}

.hero-eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}

.space-tabs :deep(.p-tabmenu-nav) {
  border: none;
  background: transparent;
  gap: 10px;
}

.space-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: #6b7280;
  font-weight: 700;
  padding: 8px 14px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.space-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: #f1f3f6;
  color: #0f172a;
  border-color: #e5e7eb;
}

.space-tabs :deep(.p-tabmenuitem-link:hover) {
  background: #f8fafc;
  color: #0f172a;
}

.tab-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.tab-head h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.tab-head p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}

.tab-hint {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 6px 10px;
  white-space: nowrap;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.8fr);
  gap: 16px;
}

.panel-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-card.highlight {
  background: linear-gradient(160deg, #1e3a8a, #2563eb);
  color: #ffffff;
  border: none;
  box-shadow: 0 18px 34px rgba(30, 64, 175, 0.35);
  position: relative;
  overflow: hidden;
}

.panel-card.highlight::after {
  content: '';
  position: absolute;
  right: -50px;
  top: -60px;
  width: 160px;
  height: 160px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.24), transparent 70%);
  pointer-events: none;
}

.panel-card.highlight .summary-label {
  color: rgba(255, 255, 255, 0.7);
}

.panel-card.highlight .summary-value {
  color: #ffffff;
}

.panel-title {
  font-weight: 700;
  color: inherit;
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.profile-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.9), rgba(226, 232, 240, 0.7));
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1e3a8a, #0ea5e9);
  color: #ffffff;
  font-weight: 700;
  font-size: 20px;
  display: grid;
  place-items: center;
  box-shadow: 0 10px 20px rgba(30, 58, 138, 0.24);
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-name {
  font-weight: 700;
  color: #0f172a;
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.profile-email {
  font-size: 13px;
  color: #64748b;
}

.profile-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.panel-empty {
  text-align: center;
  color: #64748b;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.info-item {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(248, 250, 252, 0.6);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #94a3b8;
}

.info-value {
  font-weight: 700;
  color: #0f172a;
}

.panel-card.highlight .info-value {
  color: #ffffff;
}

.summary-grid {
  display: grid;
  gap: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  font-size: 12px;
  color: #64748b;
}

.summary-value {
  font-size: 20px;
  font-weight: 800;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.chart-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  height: 180px;
  padding: 6px 4px 4px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.9), transparent);
  border-radius: 12px;
}

.chart-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.bar-fill {
  width: 100%;
  border-radius: 10px 10px 6px 6px;
  background: linear-gradient(180deg, #3b82f6, #1d4ed8);
  min-height: 6px;
  transition: height 0.3s ease;
}

.bar-fill.accent {
  background: linear-gradient(180deg, #22c55e, #15803d);
}

.bar-label {
  font-size: 11px;
  color: #94a3b8;
}

.bar-value {
  font-size: 12px;
  color: #475569;
  font-weight: 700;
}

.bank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.bank-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.bank-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
}

.bank-title {
  font-weight: 700;
  color: #0f172a;
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.bank-meta {
  font-size: 12px;
  color: #64748b;
}

.bank-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.lg {
  height: 18px;
  width: 70%;
}

.skeleton-line.sm {
  width: 45%;
}

.skeleton-tags {
  display: flex;
  gap: 6px;
}

.skeleton-pill {
  width: 48px;
  height: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .tab-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }

  .chart-bars {
    height: 140px;
  }
}
</style>
