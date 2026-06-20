<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'
import { readPracticeRecords } from '../../base/practiceRecords'
import { getStorageItem } from '../../base/vtixGlobal'
import { formatDateTime, formatRelativeTimeFromNow } from '../../utils/datetime'

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

type BrawlSummary = {
  totalMatches: number
  wins: number
  losses: number
  draws: number
  winRate: number
}

type BrawlRecordItem = {
  id: number
  problemSetCode: string
  problemSetTitle: string
  opponentId: string
  opponentName: string
  selfScore: number
  opponentScore: number
  result: 'win' | 'lose' | 'draw'
  createdAt: number
}

type BrawlUserSpaceResponse = {
  userId: string
  userName: string
  summary: BrawlSummary
  records: BrawlRecordItem[]
  total: number
  page: number
  pageSize: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const userStore = useUserStore()
const router = useRouter()
const route = useRoute()

type SpaceTab = {
  label: string
  value: 'profile' | 'practice' | 'brawl' | 'banks'
}

const selfTabs: SpaceTab[] = [
  { label: '个人信息', value: 'profile' },
  { label: '练习情况', value: 'practice' },
  { label: '对局记录', value: 'brawl' },
  { label: '我的题库', value: 'banks' }
]

const publicTabs: SpaceTab[] = [
  { label: '个人信息', value: 'profile' },
  { label: '他的题库', value: 'banks' }
]

const activeTab = ref<SpaceTab['value']>('profile')

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

const tabs = computed(() => (isSelf.value ? selfTabs : publicTabs))
const activeTabIndex = computed(() => {
  const index = tabs.value.findIndex((tab) => tab.value === activeTab.value)
  return index < 0 ? 0 : index
})

const tabItems = computed(() =>
  tabs.value.map((tab) => ({
    label: tab.label,
    command: () => {
      activeTab.value = tab.value
    }
  }))
)

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
  return formatDateTime(timestamp)
}

function formatRelativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  return formatRelativeTimeFromNow(timestamp)
}

const loginInfoText = computed(() => ({
  current: formatTimestamp(lastLoginAt.value),
  previous: prevLoginAt.value ? formatTimestamp(prevLoginAt.value) : '首次登录'
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

const brawlSummary = ref<BrawlSummary>({
  totalMatches: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0
})
const brawlRecords = ref<BrawlRecordItem[]>([])
const brawlLoading = ref(false)
const brawlError = ref('')
const brawlPage = ref(1)
const brawlPageSize = ref(6)
const brawlTotal = ref(0)
const brawlPageSizeOptions = [6, 12, 24]

const brawlWinRateText = computed(() => {
  if (brawlSummary.value.totalMatches <= 0) return '暂无'
  return `${brawlSummary.value.winRate.toFixed(1)}%`
})

function normalizeBrawlSummary(input: unknown): BrawlSummary {
  const row = (input ?? {}) as Partial<BrawlSummary>
  const totalMatches = Number(row.totalMatches ?? 0)
  const wins = Number(row.wins ?? 0)
  const losses = Number(row.losses ?? 0)
  const draws = Number(row.draws ?? 0)
  const winRateRaw = Number(row.winRate ?? 0)
  return {
    totalMatches: Number.isFinite(totalMatches) ? Math.max(0, totalMatches) : 0,
    wins: Number.isFinite(wins) ? Math.max(0, wins) : 0,
    losses: Number.isFinite(losses) ? Math.max(0, losses) : 0,
    draws: Number.isFinite(draws) ? Math.max(0, draws) : 0,
    winRate: Number.isFinite(winRateRaw) ? Math.max(0, Math.min(100, winRateRaw)) : 0
  }
}

function normalizeBrawlRecord(input: unknown): BrawlRecordItem | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Partial<BrawlRecordItem>
  const resultValue = row.result === 'win' || row.result === 'lose' || row.result === 'draw' ? row.result : 'draw'
  return {
    id: Number(row.id ?? 0),
    problemSetCode: String(row.problemSetCode ?? ''),
    problemSetTitle: String(row.problemSetTitle ?? ''),
    opponentId: String(row.opponentId ?? ''),
    opponentName: String(row.opponentName ?? '未知对手'),
    selfScore: Number(row.selfScore ?? 0),
    opponentScore: Number(row.opponentScore ?? 0),
    result: resultValue,
    createdAt: Number(row.createdAt ?? 0)
  }
}

function resultLabel(result: BrawlRecordItem['result']) {
  if (result === 'win') return '胜'
  if (result === 'lose') return '负'
  return '平'
}

async function loadBrawlSpace() {
  if (!routeName.value) return
  brawlLoading.value = true
  brawlError.value = ''
  try {
    const params = new URLSearchParams({
      name: routeName.value,
      page: String(brawlPage.value),
      pageSize: String(brawlPageSize.value)
    })
    const response = await fetch(`${apiBase}/api/brawl/user-space?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as BrawlUserSpaceResponse
    brawlSummary.value = normalizeBrawlSummary(data.summary)
    brawlRecords.value = Array.isArray(data.records)
      ? data.records
        .map((item) => normalizeBrawlRecord(item))
        .filter((item): item is BrawlRecordItem => Boolean(item))
      : []
    const totalHeader = response.headers.get('x-total-count')
    const total = totalHeader ? Number(totalHeader) : Number(data.total ?? NaN)
    brawlTotal.value = Number.isFinite(total) ? Math.max(0, total) : brawlSummary.value.totalMatches
  } catch (error) {
    brawlSummary.value = {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0
    }
    brawlRecords.value = []
    brawlTotal.value = 0
    brawlError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    brawlLoading.value = false
  }
}

function handleBrawlPage(event: PageState) {
  if (typeof event.rows === 'number') {
    brawlPageSize.value = event.rows
  }
  brawlPage.value = (event.page ?? 0) + 1
  void loadBrawlSpace()
}

const banks = ref<QuestionBankItem[]>([])
const banksLoading = ref(false)
const banksError = ref('')

const headerStats = computed(() => {
  if (isSelf.value) {
    return [
      { label: '练习时长', value: `${totalMinutes.value} 分钟` },
      { label: '完成题目', value: `${totalAnswered.value} 题` },
      { label: '记录次数', value: `${totalRecords.value} 次` },
      { label: '乱斗胜率', value: brawlWinRateText.value }
    ]
  }
  return [
    { label: '公开题库', value: banksLoading.value ? '--' : `${banks.value.length} 个` },
    { label: '对局场次', value: `${brawlSummary.value.totalMatches} 场` },
    { label: '乱斗胜率', value: brawlWinRateText.value }
  ]
})

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
    if (!tabs.value.some((tab) => tab.value === activeTab.value)) {
      activeTab.value = 'profile'
    }
    loadLoginInfo()
    syncPractice()
    brawlPage.value = 1
    void loadBrawlSpace()
    if (!isSelf.value || activeTab.value === 'banks') {
      void loadBanks()
    }
  }
)

watch(activeTab, (value) => {
  if (value === 'banks') {
    void loadBanks()
  }
  if (value === 'brawl') {
    void loadBrawlSpace()
  }
})

onMounted(() => {
  loadLoginInfo()
  syncPractice()
  void loadBrawlSpace()
  if (!isSelf.value) {
    void loadBanks()
  }
})
</script>

<template>
  <section class="space-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">个人空间</div>
        <h1>{{ displayName }} 的空间</h1>
      </div>
    </header>

    <Card class="space-content-card">
      <template #content>
        <div class="space-card-head">
          <div class="space-user-main">
            <div class="space-user-name">{{ displayName }}</div>
            <div class="profile-tags">
              <Tag :value="isSelf ? userStore.user?.groupName || '未分组' : '访客'" rounded />
              <Tag :value="isSelf ? 'Active' : 'Public'" :severity="isSelf ? 'success' : 'info'" rounded />
            </div>
          </div>
          <dl class="card-stats">
            <div v-for="item in headerStats" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </div>

        <div class="space-tabs-wrap">
          <TabMenu class="space-tabs" :model="tabItems" :activeIndex="activeTabIndex" />
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
                <div v-else class="info-simple">
                  <div class="info-line">
                    <span class="info-label">用户名</span>
                    <span class="info-value">{{ displayName }}</span>
                  </div>
                  <div v-if="isSelf" class="info-line">
                    <span class="info-label">用户组</span>
                    <span class="info-value">{{ userStore.user?.groupName || '未分组' }}</span>
                  </div>
                  <div v-if="isSelf" class="info-line">
                    <span class="info-label">邮箱</span>
                    <span class="info-value">{{ userStore.user?.email || '未填写邮箱' }}</span>
                  </div>
                  <div v-else class="info-line">
                    <span class="info-label">用户身份</span>
                    <span class="info-value">公开用户</span>
                  </div>
                </div>
              </div>
              <div v-if="isSelf" class="panel-card">
                <div class="panel-title">登录信息</div>
                <div class="info-simple">
                  <div class="info-line">
                    <span>本次登录</span>
                    <span>{{ loginInfoText.current }}</span>
                  </div>
                  <div class="info-line">
                    <span>上次登录</span>
                    <span>{{ loginInfoText.previous }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'practice'" key="practice" class="tab-panel">
            <div class="chart-grid">
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

          <section v-else-if="activeTab === 'brawl'" key="brawl" class="tab-panel">
            <div class="brawl-head">
              <div class="panel-title">大乱斗对局记录</div>
              <div class="brawl-summary-inline">
                <span>总场次 {{ brawlSummary.totalMatches }}</span>
                <span>胜率 {{ brawlSummary.totalMatches > 0 ? `${brawlSummary.winRate.toFixed(1)}%` : '暂无' }}</span>
              </div>
            </div>
            <div v-if="brawlError" class="panel-card panel-empty">
              <p>{{ brawlError }}</p>
              <Button label="重试" size="small" severity="secondary" text @click="loadBrawlSpace" />
            </div>
            <div v-else-if="brawlLoading && brawlRecords.length === 0" class="panel-card panel-empty">
              加载中...
            </div>
            <div v-else-if="brawlRecords.length === 0" class="panel-card panel-empty">暂无对局记录</div>
            <div v-else class="brawl-record-list">
              <article
                v-for="record in brawlRecords"
                :key="record.id"
                class="brawl-record-row"
              >
                <div class="brawl-record-head">
                  <div class="brawl-record-title">{{ record.problemSetTitle || record.problemSetCode }}</div>
                </div>
                <div class="brawl-card-main">
                  <div :class="['brawl-score', `is-${record.result}`]">
                    {{ record.selfScore }} : {{ record.opponentScore }}
                  </div>
                  <div class="brawl-opponent">
                    <span class="brawl-opponent-label">对手</span>
                    <span class="brawl-opponent-name">{{ record.opponentName }}</span>
                  </div>
                </div>
                <div class="brawl-record-foot">
                  <span class="brawl-time">{{ formatTimestamp(record.createdAt) }}</span>
                </div>
                <div :class="['brawl-result-float', `is-${record.result}`]">{{ resultLabel(record.result) }}</div>
              </article>
            </div>
            <Paginator
              v-if="brawlTotal > 0"
              class="brawl-paginator"
              :first="(brawlPage - 1) * brawlPageSize"
              :rows="brawlPageSize"
              :totalRecords="brawlTotal"
              :rowsPerPageOptions="brawlPageSizeOptions"
              template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
              @page="handleBrawlPage"
            />
          </section>

          <section v-else-if="activeTab === 'banks'" key="banks" class="tab-panel">
            <div v-if="isSelf && !userStore.user" class="panel-card panel-empty">
              <p>登录后可查看你创建的题库。</p>
              <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
            </div>
            <div v-else-if="banksLoading" class="bank-list">
              <div v-for="n in 4" :key="n" class="bank-row skeleton">
                <div class="bank-count skeleton-count"></div>
                <div class="bank-main">
                  <div class="skeleton-line lg"></div>
                  <div class="skeleton-line sm"></div>
                  <div class="skeleton-tags">
                    <span class="skeleton-pill"></span>
                    <span class="skeleton-pill"></span>
                  </div>
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
            <div v-else class="bank-list">
              <div
                v-for="bank in banks"
                :key="bank.id"
                class="bank-row bank-row-link p-ripple"
                v-ripple
                @click="handleBankClick($event, bank.code)"
              >
                <div class="bank-count">
                  <div class="bank-count-value">{{ bank.questionCount }}</div>
                  <div class="bank-count-label">题目数</div>
                </div>
                <div class="bank-main">
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
                        @click.stop.prevent="
                          router.push({ name: 'admin-question-bank-edit', params: { code: bank.code } })
                        "
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </transition>
      </template>
    </Card>
  </section>
</template>

<style scoped>
.space-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 8px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.page-head h1 {
  margin: 2px 0 0;
  font-size: 26px;
  line-height: 1.25;
  color: var(--vtix-text-strong);
}

.space-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 18px 22px;
  min-height: 126px;
}

.space-user-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.space-user-name {
  color: var(--vtix-text-strong);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
}

.profile-tags {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.card-stats {
  align-self: flex-end;
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 10px 20px;
  margin: 0;
  text-align: right;
}

.card-stats div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-stats dt {
  margin: 0;
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.card-stats dd {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--vtix-text-strong);
}

.space-content-card {
  overflow: hidden;
}

.space-content-card :deep(.p-card-body) {
  padding: 0;
}

.space-content-card :deep(.p-card-content) {
  padding: 0;
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
  gap: 6px;
  padding: 10px 18px 0;
  margin: 0;
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
  padding: 18px;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.panel-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.panel-grid > .panel-card + .panel-card {
  border-left: 1px solid var(--vtix-border);
  padding-left: 22px;
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

.info-simple {
  display: flex;
  flex-direction: column;
}

.info-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px dashed var(--vtix-border);
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.info-line:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.info-value {
  font-weight: 700;
  color: var(--vtix-text-strong);
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
  background: var(--vtix-primary-500);
  min-height: 6px;
  transition: height 0.3s ease;
}

.bar-fill.accent {
  background: var(--vtix-primary-700);
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

.brawl-summary-inline {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--vtix-text-subtle);
  font-size: 12px;
}

.brawl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.brawl-record-list {
  display: flex;
  flex-direction: column;
  margin-right: -18px;
  margin-left: -18px;
  border-top: 1px solid var(--vtix-border);
}

.brawl-record-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}

.brawl-record-row + .brawl-record-row {
  border-top: 1px solid var(--vtix-border);
}

.brawl-record-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

.brawl-record-title {
  color: var(--vtix-text-strong);
  font-weight: 700;
}

.brawl-card-main {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
  flex-wrap: wrap;
  z-index: 1;
}

.brawl-opponent {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brawl-opponent-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.brawl-opponent-name {
  color: var(--vtix-text-strong);
  font-weight: 700;
}

.brawl-score {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.03em;
}

.brawl-score.is-win {
  color: #0e9c61;
}

.brawl-score.is-lose {
  color: #cf4a4a;
}

.brawl-score.is-draw {
  color: #c18a1f;
}

.brawl-result-float {
  position: absolute;
  right: 0;
  bottom: -6px;
  font-size: 88px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.08em;
  pointer-events: none;
  user-select: none;
}

.brawl-result-float.is-win {
  color: color-mix(in srgb, var(--vtix-success-solid) 28%, transparent);
}

.brawl-result-float.is-lose {
  color: color-mix(in srgb, var(--vtix-danger-solid) 28%, transparent);
}

.brawl-result-float.is-draw {
  color: color-mix(in srgb, var(--vtix-warning-solid) 30%, transparent);
}

.brawl-record-foot {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-height: 22px;
  z-index: 1;
}

.brawl-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--vtix-text-subtle);
  white-space: nowrap;
}

.brawl-paginator {
  margin: 0 -18px -18px;
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.brawl-paginator :deep(.p-paginator-page),
.brawl-paginator :deep(.p-paginator-next),
.brawl-paginator :deep(.p-paginator-prev) {
  min-width: 2rem;
  height: 2rem;
}

.brawl-paginator :deep(.p-select) {
  height: 2rem;
}

.bank-list {
  display: flex;
  flex-direction: column;
  margin: -18px;
}

.bank-row {
  position: relative;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  width: 100%;
  min-height: 78px;
  padding: 22px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.bank-row + .bank-row {
  border-top: 1px solid var(--vtix-border);
}

.bank-row-link {
  cursor: pointer;
  transition: background 0.18s ease;
}

.bank-row-link:hover {
  background: var(--vtix-surface-2);
}

.bank-row.skeleton {
  overflow: hidden;
}

.bank-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bank-title {
  font-weight: 400;
  color: var(--vtix-text);
  font-size: 22px;
  line-height: 1.3;
  margin: 0;
}

.bank-info {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding-top: 8px;
}

.bank-meta {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
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
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.bank-count-value {
  font-size: 29px;
  line-height: 1.05;
  font-weight: 400;
  color: var(--vtix-text);
}

.bank-count-label {
  font-size: 11px;
  color: var(--vtix-text-subtle);
  margin-top: 8px;
}

.skeleton-count {
  width: 64px;
  height: 48px;
  border-radius: 12px;
  background: var(--vtix-surface-3);
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: var(--vtix-surface-3);
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
  background: var(--vtix-surface-3);
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }

  .space-card-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
    min-height: 0;
    padding: 24px 18px 20px;
  }

  .profile-tags {
    justify-content: flex-start;
  }

  .card-stats {
    align-self: stretch;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    text-align: left;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }

  .panel-grid > .panel-card + .panel-card {
    border-left: 0;
    border-top: 1px solid var(--vtix-border);
    padding-top: 18px;
    padding-left: 0;
  }

  .brawl-record-row {
    align-items: flex-start;
  }

  .chart-bars {
    height: 140px;
  }
}

@media (max-width: 648px) {
  .bank-row {
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 14px;
    padding: 18px 14px;
  }

  .bank-title {
    font-size: 20px;
  }

  .bank-count-value {
    font-size: 25px;
  }
}
</style>
