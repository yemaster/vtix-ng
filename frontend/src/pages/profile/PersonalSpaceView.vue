<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Button from 'primevue/button'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'
import { readPracticeRecords } from '../../base/practiceRecords'
import { getStorageItem } from '../../base/vtixGlobal'

type PracticeRecord = {
  id: string
  testId: string
  testTitle?: string
  updatedAt: number
  deletedAt?: number
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
  updatedAt?: number
  createdAt?: number
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
  const last = Number(getStorageItem(LAST_LOGIN_KEY))
  const prev = Number(getStorageItem(PREV_LOGIN_KEY))
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

function formatFullTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm')
}

function formatRelativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: zhCN
  })
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
  return readPracticeRecords<PracticeRecord>()
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

function handleBankClick(event: MouseEvent, code: string) {
  if (event.defaultPrevented) return
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const target = `/t/${code}`
  window.setTimeout(() => {
    router.push(target)
  }, 80)
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
    target.minutes += Math.round(((record.progress?.timeSpentSeconds ?? 0) as number) / 60)
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
  Math.round(
    records.value.reduce((sum, record) => sum + (record.progress?.timeSpentSeconds ?? 0), 0) / 60
  )
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
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
          updatedAt: Number(item.updatedAt ?? item.createdAt ?? 0)
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
    <header class="space-header">
      <div class="profile-card">
        <div class="profile-avatar">{{ displayName.slice(0, 1) }}</div>
        <div class="profile-main">
          <div class="profile-title">
            <div>
              <div class="profile-label">个人空间</div>
              <h1>{{ displayName }}</h1>
            </div>
            <div class="profile-tags">
              <Tag :value="isSelf ? userStore.user?.groupName || '未分组' : '访客'" rounded />
              <Tag :value="isSelf ? 'Active' : 'Public'" :severity="isSelf ? 'success' : 'info'" rounded />
            </div>
          </div>
          <div class="profile-sub">
            <span class="profile-email">{{ isSelf ? userStore.user?.email || '未填写邮箱' : '对外已隐藏' }}</span>
            <span class="profile-divider">·</span>
            <span>{{ isSelf ? '你的学习数据仅自己可见' : '访客视图，仅展示公开信息' }}</span>
          </div>
        </div>
      </div>
    </header>

    <div v-if="isSelf" class="stat-strip">
      <div class="stat-item">
        <div class="stat-label">练习时长</div>
        <div class="stat-value">{{ totalMinutes }} 分钟</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">完成题目</div>
        <div class="stat-value">{{ totalAnswered }} 题</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">记录次数</div>
        <div class="stat-value">{{ totalRecords }} 次</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">本次登录</div>
        <div class="stat-value">{{ loginInfoText.current }}</div>
      </div>
    </div>

    <div class="space-tabs-wrap">
      <TabMenu class="space-tabs" :model="tabItems" />
    </div>

    <transition name="tab-slide" mode="out-in">
      <section v-if="activeTab === 'profile'" key="profile" class="tab-panel">
      <div class="panel-grid">
        <div class="panel-card">
          <div class="panel-head">
            <div class="panel-title">基本信息</div>
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
          <div v-else class="info-grid">
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
              <div class="info-label">邮箱</div>
              <div class="info-value">
                {{ isSelf ? userStore.user?.email || '未填写邮箱' : '对外已隐藏' }}
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">访问权限</div>
              <div class="info-value">{{ isSelf ? '仅自己可见' : '公开资料' }}</div>
            </div>
          </div>
        </div>
        <div class="panel-card">
          <div class="panel-title">登录信息</div>
          <div v-if="!isSelf" class="panel-empty">对外已隐藏</div>
          <div v-else class="info-list">
            <div class="info-row">
              <span>本次登录</span>
              <span>{{ loginInfoText.current }}</span>
            </div>
            <div class="info-row">
              <span>上次登录</span>
              <span>{{ loginInfoText.previous }}</span>
            </div>
          </div>
        </div>
      </div>
      </section>

      <section v-else-if="activeTab === 'practice'" key="practice" class="tab-panel">
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

      <section v-else-if="activeTab === 'banks'" key="banks" class="tab-panel">
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
          <div class="skeleton-count"></div>
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
        <div
          v-for="bank in banks"
          :key="bank.id"
          class="bank-card bank-card-link p-ripple"
          v-ripple
          @click="handleBankClick($event, bank.code)"
        >
          <div class="bank-card-top">
            <div class="bank-card-main">
              <div class="bank-title">{{ bank.title }}</div>
              <div class="bank-info">
                <div class="bank-tags">
                  <Tag v-for="tag in bank.categories" :key="tag" :value="tag" rounded />
                  <span v-if="bank.categories.length === 0" class="bank-tag-empty">无标签</span>
                </div>
                <div class="bank-meta">
                  <span class="meta-year">{{ bank.year }} 年</span>
                  <span class="meta-time" v-tooltip.bottom="formatFullTime(bank.updatedAt ?? 0)">
                    @{{ formatRelativeTime(bank.updatedAt ?? 0) }}
                  </span>
                </div>
                <div v-if="isSelf" class="bank-actions">
                  <Button
                    label="编辑"
                    size="small"
                    severity="secondary"
                    text
                    @click.stop.prevent="router.push({ name: 'admin-question-bank-edit', params: { code: bank.code } })"
                  />
                </div>
              </div>
            </div>
            <div class="bank-count">
              <div class="bank-count-value">{{ bank.questionCount }}</div>
              <div class="bank-count-label">题目数</div>
            </div>
          </div>
        </div>
      </div>
      </section>
    </transition>
  </section>
</template>

<style scoped>
.space-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.space-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.profile-card {
  flex: 1;
  min-width: 260px;
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 10px 24px var(--vtix-shadow-soft);
}

.profile-avatar {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--vtix-primary-100);
  border: 1px solid var(--vtix-primary-200);
  color: var(--vtix-primary-700);
  font-weight: 800;
  font-size: 22px;
  display: grid;
  place-items: center;
}

.profile-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.profile-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.profile-title h1 {
  margin: 4px 0 0;
  font-size: 28px;
  color: var(--vtix-text-strong);
  font-family: 'Space Grotesk', 'SF Pro Display', 'Segoe UI', sans-serif;
}

.profile-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.profile-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.profile-email {
  font-weight: 600;
  color: var(--vtix-text-muted);
}

.profile-divider {
  color: var(--vtix-text-subtle);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 12px 14px;
  box-shadow: 0 10px 20px var(--vtix-shadow-soft);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.stat-value {
  font-weight: 800;
  color: var(--vtix-text-strong);
}

.space-tabs :deep(.p-tabmenu-nav) {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  border: none;
  background: transparent;
  gap: 10px;
  padding-bottom: 6px;
  margin-bottom: -6px;
}

.space-tabs-wrap {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.space-tabs {
  min-width: max-content;
}

.space-tabs :deep(.p-tabmenuitem) {
  flex: 0 0 auto;
}

.space-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: var(--vtix-text-muted);
  font-weight: 700;
  padding: 8px 14px;
  white-space: nowrap;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.space-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: var(--vtix-surface-5);
  color: var(--vtix-text-strong);
  border-color: var(--vtix-border);
}

.space-tabs :deep(.p-tabmenuitem-link:hover) {
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
}

.space-tabs :deep(.p-tabmenu-ink-bar) {
  transition: transform 0.25s ease, width 0.25s ease;
}

.tab-slide-enter-active,
.tab-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.tab-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.tab-slide-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.tab-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.tab-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 12px 24px var(--vtix-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 14px;
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


.panel-empty {
  text-align: center;
  color: var(--vtix-text-muted);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.info-item {
  background: var(--vtix-surface-2);
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid var(--vtix-border-strong);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.info-value {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--vtix-border);
  border-radius: 12px;
  background: var(--vtix-surface-2);
  color: var(--vtix-text-muted);
  font-size: 13px;
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
  background: var(--vtix-surface-2);
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
  background: linear-gradient(180deg, var(--vtix-primary-400), var(--vtix-primary-700));
  min-height: 6px;
  transition: height 0.3s ease;
}

.bar-fill.accent {
  background: linear-gradient(180deg, var(--vtix-primary-500), var(--vtix-primary-800));
}

.bar-label {
  font-size: 11px;
  color: var(--vtix-text-subtle);
}

.bar-value {
  font-size: 12px;
  color: var(--vtix-text-muted);
  font-weight: 700;
}

.bank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.bank-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  box-shadow: 0 16px 30px var(--vtix-shadow);
}

.bank-card-link {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.bank-card-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px var(--vtix-shadow-strong);
}

.bank-card.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--vtix-surface-2);
}

.bank-card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: stretch;
  flex: 1;
}

.bank-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bank-title {
  font-weight: 700;
  color: var(--vtix-text);
  font-size: 20px;
  line-height: 1.3;
  margin: 0;
}

.bank-info {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
}

.bank-meta {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  line-height: 1.5;
}

.bank-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bank-tags :deep(.p-tag) {
  font-size: 12px;
}

.meta-year,
.meta-time {
  font-weight: 400;
}

.meta-year {
  color: var(--vtix-text-muted);
}

.meta-time {
  color: var(--vtix-text-muted);
}

.bank-tag-empty {
  font-size: 12px;
  color: var(--vtix-text-subtle);
  border: 1px dashed var(--vtix-border-strong);
  padding: 2px 8px;
  border-radius: 999px;
}

.bank-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bank-count {
  text-align: center;
  min-width: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.bank-count-value {
  font-size: 42px;
  font-weight: 800;
  color: var(--vtix-text);
}

.bank-count-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.skeleton-count {
  width: 64px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
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
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
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
  .space-header {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }

  .chart-bars {
    height: 140px;
  }
}
</style>
