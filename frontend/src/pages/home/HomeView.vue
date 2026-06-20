<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataView from 'primevue/dataview'
import { readPracticeRecords } from '../../base/practiceRecords'

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
  }
}

const router = useRouter()
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const records = ref<PracticeRecord[]>([])
const notices = ref<NoticeItem[]>([])
const recommendedSets = ref<RecommendedSet[]>([])

type NoticeItem = {
    id: string
    title: string
    authorName: string
    isPinned: boolean
    createdAt: number
    updatedAt: number
}

type StatsResponse = {
    totalSets: number
    questionCount: number
}

type RecommendedSet = {
    code: string
    title: string
    year: number
    questionCount: number
    categories: string[]
    recommendedRank: number | null
}

const statsData = ref<StatsResponse>({
    totalSets: 0,
    questionCount: 0
})

const modes = [
    { label: '顺序练习', value: 0 },
    { label: '乱序练习', value: 1 },
    { label: '自定义练习', value: 2 },
    { label: '错题回顾', value: 4 },
    { label: '模拟考试', value: 5 }
]

const recommendedTimeline = computed(() =>
    recommendedSets.value.map((item) => ({
        code: item.code,
        name: item.title,
        date: item.year ? `${item.year} 年 · ${item.questionCount} 题` : `推荐 · ${item.questionCount} 题`
    }))
)

const featuredRecommended = computed(() => recommendedTimeline.value.slice(0, 5))

const recentRecords = computed(() =>
    records.value
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
)

const homeNotices = computed(() =>
    notices.value
        .slice()
        .sort((a, b) => {
            if (a.isPinned !== b.isPinned) {
                return a.isPinned ? -1 : 1
            }
            return b.createdAt - a.createdAt
        })
        .slice(0, 5)
)

const heroStats = computed(() => {
    const todayStart = getTodayStart()
    const practiceToday = records.value.filter((item) => item.updatedAt >= todayStart).length
    return [
        { label: '今日练习', value: formatStatValue(practiceToday) },
        { label: '题库', value: formatStatValue(statsData.value.totalSets) },
        { label: '题目', value: formatStatValue(statsData.value.questionCount) }
    ]
})

function getModeLabel(value: number) {
    return modes.find((item) => item.value === value)?.label ?? '练习'
}

function getTodayStart() {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now.getTime()
}

function formatTimestamp(timestamp: number) {
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
}

function formatDuration(seconds: number) {
    const total = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    const mm = String(minutes).padStart(2, '0')
    const ss = String(secs).padStart(2, '0')
    if (hours > 0) {
        return `${hours}:${mm}:${ss}`
    }
    return `${mm}:${ss}`
}

function formatFullTime(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--'
    }
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatRelativeTime(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--'
    }
    const diff = Date.now() - timestamp
    if (diff < 60 * 1000) {
        return '刚刚'
    }
    if (diff < 60 * 60 * 1000) {
        return `${Math.floor(diff / (60 * 1000))} 分钟前`
    }
    if (diff < 24 * 60 * 60 * 1000) {
        return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
    }
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days} 天前`
}

function formatStatValue(value: number) {
    if (!Number.isFinite(value)) {
        return '--'
    }
    return new Intl.NumberFormat('zh-CN').format(value)
}

async function loadStats() {
    try {
        const response = await fetch(`${apiBase}/api/stats`)
        if (!response.ok) {
            throw new Error(`加载失败: ${response.status}`)
        }
        const data = (await response.json()) as StatsResponse
        statsData.value = {
            totalSets: Number.isFinite(data.totalSets) ? data.totalSets : 0,
            questionCount: Number.isFinite(data.questionCount) ? data.questionCount : 0
        }
    } catch {
        statsData.value = {
            totalSets: 0,
            questionCount: 0
        }
    }
}

async function loadNotices() {
    try {
        const response = await fetch(`${apiBase}/api/notices?limit=50`)
        if (!response.ok) {
            throw new Error(`加载失败: ${response.status}`)
        }
        const data = (await response.json()) as NoticeItem[]
        notices.value = Array.isArray(data)
            ? data.map((item) => ({
                  id: String(item.id),
                  title: item.title ?? '',
                  authorName: item.authorName ?? '管理员',
                  isPinned: Boolean(item.isPinned),
                  createdAt: Number(item.createdAt ?? 0),
                  updatedAt: Number(item.updatedAt ?? item.createdAt ?? 0)
              }))
            : []
    } catch {
        notices.value = []
    }
}

async function loadRecommended() {
    try {
        const response = await fetch(`${apiBase}/api/problem-sets/recommended?limit=8`)
        if (!response.ok) {
            throw new Error(`加载失败: ${response.status}`)
        }
        const data = (await response.json()) as RecommendedSet[]
        recommendedSets.value = Array.isArray(data)
            ? data.map((item) => ({
                  code: String(item.code ?? ''),
                  title: String(item.title ?? ''),
                  year: Number(item.year ?? 0),
                  questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
                  categories: Array.isArray(item.categories) ? item.categories : [],
                  recommendedRank: item.recommendedRank ?? null
              })).filter((item) => item.code && item.title)
            : []
    } catch {
        recommendedSets.value = []
    }
}

function loadRecords() {
    records.value = readPracticeRecords<PracticeRecord>()
}

onMounted(() => {
    loadRecords()
    void loadStats()
    void loadNotices()
    void loadRecommended()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">VSTC TI X</div>
        <h1>在线题库练习</h1>
        <div class="page-actions">
          <Button label="开始练习" icon="pi pi-play-circle" severity="secondary" text @click="router.push({ name: 'question-bank' })" />
          <Button label="题库广场" icon="pi pi-th-large" severity="secondary" text @click="router.push({ name: 'question-bank-plaza' })" />
          <Button label="错题本" icon="pi pi-bookmark" severity="secondary" text @click="router.push({ name: 'wrong-problems' })" />
        </div>
      </div>
      <dl class="metric-line">
        <div v-for="item in heroStats" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
    </header>

    <div class="content-grid">
      <main class="main-column">
        <Card class="home-card">
          <template #title>
            <div class="card-title-row">
              <span>公告</span>
              <Button label="全部" severity="secondary" text size="small" @click="router.push({ name: 'notices' })" />
            </div>
          </template>
          <template #content>
            <DataView :value="homeNotices" data-key="id" class="compact-data-view">
              <template #empty>
                <div class="empty">暂无公告</div>
              </template>
              <template #list="slotProps">
                <div class="list">
                  <div v-for="item in slotProps.items" :key="item.id" :class="['list-row', 'notice-row', { pinned: item.isPinned }]">
                    <RouterLink class="list-main vertical" :to="{ name: 'notice-detail', params: { id: item.id } }">
                      <span class="list-title">{{ item.title }}</span>
                      <span class="list-meta">
                        {{ item.authorName || '管理员' }} @
                        <time v-tooltip.bottom="formatFullTime(item.createdAt)">
                          {{ formatRelativeTime(item.createdAt) }}
                        </time>
                      </span>
                    </RouterLink>
                  </div>
                </div>
              </template>
            </DataView>
          </template>
        </Card>
        <Card class="home-card">
          <template #title>
            <div class="card-title-row">
              <span>推荐题库</span>
              <Button label="全部" severity="secondary" text size="small" @click="router.push({ name: 'question-bank' })" />
            </div>
          </template>
          <template #content>
            <DataView :value="featuredRecommended" data-key="code" class="compact-data-view">
              <template #empty>
                <div class="empty">暂无推荐题库</div>
              </template>
              <template #list="slotProps">
                <div class="list">
                  <RouterLink v-for="item in slotProps.items" :key="item.code" class="list-row action-row" :to="`/t/${item.code}`">
                    <span class="list-main vertical">
                      <span class="list-title">{{ item.name }}</span>
                      <span class="list-meta">{{ item.date }}</span>
                    </span>
                  </RouterLink>
                </div>
              </template>
            </DataView>
          </template>
        </Card>
      </main>

      <aside class="side-column">
        <Card class="home-card">
          <template #title>
            <div class="card-title-row">
              <span>最近练习</span>
              <Button label="全部" severity="secondary" text size="small" @click="router.push({ name: 'records' })" />
            </div>
          </template>
          <template #content>
            <DataView :value="recentRecords" data-key="id" class="compact-data-view">
              <template #empty>
                <div class="empty">暂无记录</div>
              </template>
              <template #list="slotProps">
                <div class="list">
                  <button
                    v-for="record in slotProps.items"
                    :key="record.id"
                    type="button"
                    class="list-row action-row"
                    @click="router.push({ name: 'test', params: { id: record.testId }, query: { record: record.id } })"
                  >
                    <span class="list-main vertical">
                      <span class="list-title">{{ getModeLabel(record.practiceMode) }}</span>
                      <span class="list-meta">{{ record.testTitle ?? `题库 ${record.testId}` }} · {{ formatTimestamp(record.updatedAt) }}</span>
                    </span>
                    <span class="record-stats">
                      <span>{{ formatDuration(record.progress.timeSpentSeconds ?? 0) }}</span>
                      <span>{{ (record.progress.currentProblemId ?? 0) + 1 }}/{{ record.progress.problemList?.length ?? 0 }}</span>
                    </span>
                  </button>
                </div>
              </template>
            </DataView>
          </template>
        </Card>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  --home-list-x: 1.1rem;
  --home-list-y: 11px;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--vtix-border);
  padding-top: 8px;
}

.home-card {
  min-width: 0;
}

.home-card :deep(.p-card-body) {
  gap: 1rem;
  padding: 1.1rem 0;
}

.home-card :deep(.p-card-title) {
  color: var(--vtix-text-strong);
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.35;
  padding: 0 1.1rem;
}

.home-card :deep(.p-card-content) {
  padding: 0;
}

.page-head h1 {
  margin: 4px 0 6px;
  color: var(--vtix-text-strong);
  font-size: 30px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.page-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.metric-line {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin: 0;
}

.metric-line div {
  min-width: 68px;
}

.metric-line dt {
  color: var(--vtix-text-muted);
  font-size: 0.76rem;
  line-height: 1.2;
  margin: 0 0 5px;
}

.metric-line dd {
  margin: 0;
  color: var(--vtix-text-strong);
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.35;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.24fr) minmax(320px, 0.76fr);
  gap: 24px;
  align-items: start;
}

.main-column,
.side-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.compact-data-view :deep(.p-dataview-content) {
  background: transparent;
}

.compact-data-view :deep(.p-dataview-empty-message) {
  padding: 0;
}

.list {
  display: flex;
  flex-direction: column;
}

.list-row {
  min-height: 52px;
  padding-block: var(--home-list-y);
  padding-inline: var(--home-list-x);
}

.list-row:first-child {
  padding-top: 0;
}

.list-row:last-child {
  padding-bottom: 0;
}

.list-row + .list-row {
  border-top: 1px solid var(--vtix-border);
}

.action-row {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-decoration: none;
}

.action-row,
.notice-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.notice-row {
  position: relative;
  grid-template-columns: minmax(0, 1fr);
}

.notice-row.pinned::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0;
  background: var(--vtix-primary-500);
}

.notice-row.pinned {
  padding-left: var(--home-list-x);
}

.action-row:hover {
  color: var(--vtix-primary-700);
}

.list-main {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 0.5rem;
  color: inherit;
  text-decoration: none;
}

.list-main.vertical {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.list-title {
  color: var(--vtix-text-strong);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.action-row:hover .list-title {
  color: var(--vtix-primary-700);
}

.list-meta,
.record-stats {
  color: var(--vtix-text-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}

.record-stats {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: right;
}

.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
  font-size: 0.875rem;
  padding: 1.75rem 0;
}

@media (max-width: 768px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .page-head {
    flex-direction: column;
  }

  .metric-line {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .content-grid {
    gap: 24px;
  }

  .action-row,
  .notice-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
  }

  .record-stats {
    text-align: left;
  }
}
</style>
