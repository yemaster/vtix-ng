<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'

type AdminStats = {
  totalSets: number
  publicSets: number
  activeUsers: number
  visitCount: number
  practiceCount: number
  deltas?: {
    totalSets7d?: number
    publicSets7d?: number
    activeUsersToday?: number
    visitToday?: number
    practiceToday?: number
  }
}

type QuickLink = {
  title: string
  desc: string
  to: { name: string }
  disabled: boolean
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const userStore = useUserStore()

const MANAGE_QUESTION_BANK_OWN = 1 << 9
const MANAGE_QUESTION_BANK_ALL = 1 << 10
const MANAGE_USERS = 1 << 11

const canManageQuestionBanks = computed(() => {
  const permissions = userStore.user?.permissions ?? 0
  return (
    (permissions & MANAGE_QUESTION_BANK_ALL) === MANAGE_QUESTION_BANK_ALL ||
    (permissions & MANAGE_QUESTION_BANK_OWN) === MANAGE_QUESTION_BANK_OWN
  )
})

const canManageUsers = computed(() => {
  const permissions = userStore.user?.permissions ?? 0
  return (permissions & MANAGE_USERS) === MANAGE_USERS
})

const quickLinks = computed<QuickLink[]>(() => [
  {
    title: '题库管理',
    desc: '查看与维护题库',
    to: { name: 'admin-question-banks' },
    disabled: !canManageQuestionBanks.value
  },
  {
    title: '用户管理',
    desc: '用户与权限配置',
    to: { name: 'admin-users' },
    disabled: !canManageUsers.value
  },
  {
    title: '用户组管理',
    desc: '分组与权限模板',
    to: { name: 'admin-user-groups' },
    disabled: !canManageUsers.value
  }
])

const stats = ref<AdminStats | null>(null)
const loading = ref(true)
const loadError = ref('')

function formatNumber(value?: number | null) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString()
}

function formatDelta(label: string, value?: number | null) {
  if (value === null || value === undefined) return '暂无趋势'
  const sign = value >= 0 ? '+' : ''
  return `${label} ${sign}${value}`
}

const metaText = computed(() => ({
  totalSets: formatDelta('近 7 天', stats.value?.deltas?.totalSets7d),
  publicSets: formatDelta('近 7 天', stats.value?.deltas?.publicSets7d),
  activeUsers: formatDelta('今日', stats.value?.deltas?.activeUsersToday),
  visitCount: formatDelta('今日', stats.value?.deltas?.visitToday),
  practiceCount: formatDelta('今日', stats.value?.deltas?.practiceToday)
}))

async function loadStats() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/stats`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      router.push({ name: 'login' })
      return
    }
    if (response.status === 403) {
      loadError.value = '无权限查看数据概览'
      stats.value = null
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    stats.value = (await response.json()) as AdminStats
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    stats.value = null
  } finally {
    loading.value = false
  }
}

function handleQuickLink(link: QuickLink) {
  if (link.disabled) return
  router.push(link.to)
}

onMounted(() => {
  void loadStats()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">管理后台</div>
        <h1>数据概览</h1>
        <p>查看平台关键数据与管理入口。</p>
      </div>
      <div class="head-actions">
        <span class="tag">今日</span>
        <span class="tag soft">本周</span>
        <span class="tag soft">本月</span>
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">统计数据加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section class="stats-grid">
      <template v-if="loading">
        <div v-for="n in 5" :key="`stat-skeleton-${n}`" class="vtix-panel stat-card skeleton">
          <div class="skeleton-line sm"></div>
          <div class="skeleton-line lg"></div>
          <div class="skeleton-line md"></div>
        </div>
      </template>
      <template v-else-if="!loadError">
        <div class="vtix-panel stat-card">
          <div class="stat-title">题库总数</div>
          <div class="stat-value">{{ formatNumber(stats?.totalSets) }}</div>
          <div class="stat-meta">{{ metaText.totalSets }}</div>
        </div>
        <div class="vtix-panel stat-card">
          <div class="stat-title">公开题库</div>
          <div class="stat-value">{{ formatNumber(stats?.publicSets) }}</div>
          <div class="stat-meta">{{ metaText.publicSets }}</div>
        </div>
        <div class="vtix-panel stat-card">
          <div class="stat-title">活跃用户</div>
          <div class="stat-value">{{ formatNumber(stats?.activeUsers) }}</div>
          <div class="stat-meta">{{ metaText.activeUsers }}</div>
        </div>
        <div class="vtix-panel stat-card">
          <div class="stat-title">访问量</div>
          <div class="stat-value">{{ formatNumber(stats?.visitCount) }}</div>
          <div class="stat-meta">{{ metaText.visitCount }}</div>
        </div>
        <div class="vtix-panel stat-card">
          <div class="stat-title">练习次数</div>
          <div class="stat-value">{{ formatNumber(stats?.practiceCount) }}</div>
          <div class="stat-meta">{{ metaText.practiceCount }}</div>
        </div>
      </template>
    </section>

    <section class="panel-grid">
      <div class="vtix-panel">
        <div class="vtix-panel__title">快速入口</div>
        <div class="vtix-panel__content">
          <div class="quick-links">
            <button
              v-for="item in quickLinks"
              :key="item.title"
              type="button"
              :class="['quick-card', { disabled: item.disabled }]"
              :disabled="item.disabled"
              @click="handleQuickLink(item)"
            >
              <div class="quick-title">{{ item.title }}</div>
              <div class="quick-desc">{{ item.desc }}</div>
              <div class="quick-note">{{ item.disabled ? '暂无权限' : '点击进入' }}</div>
            </button>
          </div>
        </div>
      </div>

    </section>
  </section>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-head h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.page-head p {
  margin: 0;
  color: var(--vtix-text-muted);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tag {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--vtix-ink);
  color: var(--vtix-inverse-text);
}

.tag.soft {
  background: var(--vtix-border-strong);
  color: var(--vtix-text-strong);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.status {
  border: 1px solid var(--vtix-danger-border);
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  padding: 14px 16px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-title {
  color: var(--vtix-text-muted);
  font-weight: 600;
  font-size: 13px;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--vtix-text-strong);
}

.stat-meta {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.stat-card.skeleton {
  gap: 12px;
}

.skeleton-line {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.sm {
  height: 12px;
  width: 40%;
}

.skeleton-line.md {
  height: 12px;
  width: 60%;
}

.skeleton-line.lg {
  height: 28px;
  width: 70%;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.quick-card {
  border-radius: 14px;
  border: 1px solid var(--vtix-border-strong);
  padding: 12px;
  background: var(--vtix-surface-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
  appearance: none;
  font: inherit;
  text-align: left;
  width: 100%;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.quick-card.disabled {
  opacity: 0.7;
  cursor: not-allowed;
  box-shadow: none;
}

.quick-card:not(.disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px var(--vtix-shadow);
}

.quick-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.quick-desc {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.quick-note {
  font-size: 12px;
  color: var(--vtix-text-subtle);
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
  .page-head {
    flex-direction: column;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
