<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

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
const STORAGE_KEY = 'vtixSave'
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
    recommendedCount: number
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
    questionCount: 0,
    recommendedCount: 0
})

const stats = computed(() => [
    {
        title: '题库总量',
        value: formatStatValue(statsData.value.totalSets),
        detail: '覆盖公开题库',
        delta: '公开',
        tone: 'indigo'
    },
    {
        title: '题目总数',
        value: formatStatValue(statsData.value.questionCount),
        detail: '持续更新中',
        delta: '累计',
        tone: 'emerald'
    },
    {
        title: '推荐题库',
        value: formatStatValue(statsData.value.recommendedCount),
        detail: '重点优先练习',
        delta: '推荐',
        tone: 'amber'
    }
])

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

const recentRecords = computed(() =>
    records.value
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
)

const pinnedNotices = computed(() => notices.value.filter((item) => item.isPinned))

const heroStats = computed(() => {
    const todayStart = getTodayStart()
    const practiceToday = records.value.filter((item) => item.updatedAt >= todayStart).length
    const practiceTotal = records.value.length
    const totalSeconds = records.value.reduce(
        (sum, item) => sum + (item.progress?.timeSpentSeconds ?? 0),
        0
    )
    return [
        { label: '今日练习', value: formatStatValue(practiceToday) },
        { label: '累计练习', value: formatStatValue(practiceTotal) },
        { label: '累计时长', value: formatDuration(totalSeconds) }
    ]
})

const topGridRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)
let heroResizeObserver: ResizeObserver | null = null

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
            questionCount: Number.isFinite(data.questionCount) ? data.questionCount : 0,
            recommendedCount: Number.isFinite(data.recommendedCount) ? data.recommendedCount : 0
        }
    } catch {
        statsData.value = {
            totalSets: 0,
            questionCount: 0,
            recommendedCount: 0
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
        const response = await fetch(`${apiBase}/api/problem-sets/recommended?limit=12`)
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
    if (!window.localStorage) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
            records.value = parsed.filter(
                (item) =>
                    item &&
                    typeof item.id === 'string' &&
                    !(typeof item.deletedAt === 'number' && Number(item.deletedAt) > 0)
            )
        }
    } catch {
        records.value = []
    }
}

onMounted(() => {
    loadRecords()
    void loadStats()
    void loadNotices()
    void loadRecommended()
    if (typeof ResizeObserver !== 'undefined') {
        heroResizeObserver = new ResizeObserver(() => {
            syncBannerHeight()
        })
        if (heroRef.value) {
            heroResizeObserver.observe(heroRef.value)
        }
        syncBannerHeight()
    } else {
        syncBannerHeight()
        window.addEventListener('resize', syncBannerHeight)
    }
})

onUnmounted(() => {
    if (heroResizeObserver) {
        heroResizeObserver.disconnect()
        heroResizeObserver = null
    } else {
        window.removeEventListener('resize', syncBannerHeight)
    }
})

function syncBannerHeight() {
    const height = heroRef.value?.getBoundingClientRect().height
    if (!height || !topGridRef.value) return
    topGridRef.value.style.setProperty('--banner-height', `${Math.ceil(height)}px`)
}
</script>

<template>
  <section class="page">
    <div ref="topGridRef" class="top-grid">
      <div ref="heroRef" class="hero-card">
        <div class="eyebrow">VTIX 答题自测</div>
        <h1>开学考和政治机考随心练</h1>
        <div class="hero-actions">
          <Button label="进入题库" @click="router.push({ name: 'question-bank' })" />
          <Button label="开始练习" severity="secondary" outlined @click="router.push({ name: 'question-bank' })" />
        </div>
        <div class="hero-meta">
          <div v-for="item in heroStats" :key="item.label">
            <div class="meta-label">{{ item.label }}</div>
            <div class="meta-value">{{ item.value }}</div>
          </div>
        </div>
      </div>

      <section class="notice-spotlight">
        <div class="panel notice-panel">
          <div class="panel-head">
            <div>
              <div class="panel-eyebrow">公告通知</div>
              <h2>置顶公告</h2>
            </div>
            <div class="panel-actions">
              <button type="button" class="panel-link" @click="router.push({ name: 'notices' })">查看全部</button>
            </div>
          </div>
          <div v-if="pinnedNotices.length === 0" class="notice-empty">
            暂无置顶公告
            <RouterLink class="notice-more" :to="{ name: 'notices' }">查看全部公告</RouterLink>
          </div>
          <div v-else class="notice-table-wrap">
            <table class="notice-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>发布人</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pinnedNotices" :key="item.id" :class="{ 'is-pinned': item.isPinned }">
                  <td>
                    <RouterLink class="notice-link" :to="{ name: 'notice-detail', params: { id: item.id } }">
                      <span class="notice-title">{{ item.title }}</span>
                      <Tag v-if="item.isPinned" value="置顶" severity="info" rounded />
                    </RouterLink>
                  </td>
                  <td class="notice-meta">{{ item.authorName || '管理员' }}</td>
                  <td class="notice-time" v-tooltip.bottom="formatFullTime(item.createdAt)">
                    {{ formatRelativeTime(item.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <div class="grid stats-grid">
      <div v-for="stat in stats" :key="stat.title" class="stat-card">
        <div class="stat-top">
          <div class="stat-label">{{ stat.title }}</div>
          <span :class="['stat-tag', `is-${stat.tone}`]">{{ stat.delta }}</span>
        </div>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-detail">{{ stat.detail }}</div>
      </div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-eyebrow">做题记录</div>
            <h2>最近练习</h2>
          </div>
          <button type="button" class="panel-link" @click="router.push({ name: 'records' })">查看全部</button>
        </div>
        <div class="record-preview" v-if="recentRecords.length">
          <button
            v-for="record in recentRecords"
            :key="record.id"
            type="button"
            class="record-row"
            @click="router.push({ name: 'test', params: { id: record.testId }, query: { record: record.id } })"
          >
            <div>
              <div class="record-title">{{ getModeLabel(record.practiceMode) }}</div>
              <div class="record-meta">
                {{ record.testTitle ?? `题库 ${record.testId}` }} · {{ formatTimestamp(record.updatedAt) }}
              </div>
            </div>
            <div class="record-stats">
              <span>用时 {{ formatDuration(record.progress.timeSpentSeconds ?? 0) }}</span>
              <span>
                进度 {{ (record.progress.currentProblemId ?? 0) + 1 }}/{{ record.progress.problemList?.length ?? 0 }}
              </span>
            </div>
          </button>
        </div>
        <div v-else class="record-empty">暂无记录</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-eyebrow">练习安排</div>
            <h2>推荐题库</h2>
          </div>
          <Tag value="重点练习" severity="secondary" rounded />
        </div>
        <div v-if="recommendedTimeline.length === 0" class="record-empty">暂无推荐题库</div>
        <ul v-else class="timeline">
          <li v-for="item in recommendedTimeline" :key="item.code" class="timeline-item">
            <RouterLink class="timeline-link" :to="`/t/${item.code}`">
              <div>
                <div class="timeline-name">{{ item.name }}</div>
                <div class="timeline-date">{{ item.date }}</div>
              </div>
              <Tag value="推荐" severity="secondary" rounded />
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  --card-radius: 14px;
  --card-border: #e4e7ec;
}

.top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.9fr);
  gap: 16px;
  align-items: start;
}

.hero-card {
  background: #ffffff;
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: 28px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6f7785;
  margin-bottom: 8px;
}

h1 {
  margin: 0 0 10px;
  color: #151820;
  font-size: 32px;
  letter-spacing: -0.02em;
}

p {
  margin: 0 0 18px;
  color: #525a66;
  max-width: 720px;
}

.hero-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.meta-label {
  font-size: 12px;
  color: #7b8494;
  letter-spacing: 0.02em;
}

.meta-value {
  font-weight: 800;
  color: #151820;
  font-size: 20px;
  margin-top: 4px;
}

.meta-value.positive {
  color: #0f9b6c;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.stats-grid {
  margin-top: 2px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-label {
  color: #7b8494;
  font-size: 13px;
}

.stat-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: #f1f5f9;
  color: #475569;
}

.stat-tag.is-indigo {
  background: var(--vtix-primary-100);
  color: var(--vtix-primary-700);
  border-color: var(--vtix-primary-200);
}

.stat-tag.is-emerald {
  background: var(--vtix-primary-100);
  color: var(--vtix-primary-700);
  border-color: var(--vtix-primary-200);
}

.stat-tag.is-amber {
  background: var(--vtix-primary-100);
  color: var(--vtix-primary-700);
  border-color: var(--vtix-primary-200);
}

.stat-value {
  font-size: 28px;
  color: #151820;
  font-weight: 800;
}

.stat-detail {
  color: #6b7280;
  font-size: 12px;
}

.panel-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.notice-spotlight {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
}

.panel.notice-panel {
  background: #ffffff;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: var(--banner-height, auto);
  min-height: 0;
}

.panel {
  background: #ffffff;
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
  margin-bottom: 4px;
}

.panel h2 {
  margin: 0;
  color: #161b22;
  font-size: 20px;
}

.panel-head :deep(.p-tag) {
  font-size: 12px;
}

.panel-link {
  border: none;
  background: transparent;
  color: var(--vtix-primary-600);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.record-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-row {
  text-align: left;
  border: none;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f7f8fa;
  border: 1px dashed var(--card-border);
  border-radius: var(--card-radius);
  padding: 12px;
}

.record-row:hover {
  border-color: var(--vtix-primary-200);
  background: var(--vtix-primary-50);
}

.record-title {
  font-weight: 700;
  color: #111827;
}

.record-meta {
  color: #6b7280;
  font-size: 12px;
  margin-top: 4px;
}

.record-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #475569;
  font-size: 12px;
  text-align: right;
}

.record-stats span {
  white-space: nowrap;
}

.record-empty {
  color: #9aa2b2;
  text-align: center;
  font-size: 13px;
  padding: 12px 0;
}

.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
}

.timeline-item {
  padding: 12px;
  border-radius: var(--card-radius);
  background: #f7f8fa;
  border: 1px dashed var(--card-border);
}

.timeline-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.timeline-name {
  color: #111827;
  font-weight: 700;
}

.timeline-date {
  color: #6b7280;
  font-size: 13px;
}

.notice-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.notice-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.notice-table th {
  text-align: left;
  font-size: 12px;
  color: #9aa2b2;
  font-weight: 600;
  padding: 8px 10px;
  border-bottom: 1px solid var(--card-border);
  background: #f8fafc;
  position: sticky;
  top: 0;
}

.notice-table td {
  padding: 10px;
  border-bottom: 1px dashed var(--card-border);
  vertical-align: middle;
}

.notice-table tr.is-pinned td {
  background: #f8fbff;
}

.notice-table tr:hover td {
  background: var(--vtix-primary-50);
}

.notice-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: inherit;
  font-weight: 600;
}

.notice-link :deep(.p-tag) {
  font-size: 11px;
}

.notice-title {
  color: #111827;
  font-weight: 700;
}

.notice-meta {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.notice-time {
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
}

.notice-empty {
  color: #9aa2b2;
  text-align: center;
  font-size: 13px;
  padding: 12px 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.notice-more {
  color: var(--vtix-primary-600);
  text-decoration: none;
  font-weight: 600;
}

@media (max-width: 768px) {
  .top-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-card,
  .panel.notice-panel {
    height: auto;
  }

  .notice-table th,
  .notice-table td {
    padding: 8px;
  }

  .hero-meta {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .panel-head {
    align-items: flex-start;
  }

  .record-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .record-stats {
    text-align: left;
  }

  .notice-link {
    flex-direction: column;
    align-items: flex-start;
  }

  .notice-time {
    margin-left: 0;
  }
}
</style>
