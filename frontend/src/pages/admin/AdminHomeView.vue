<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type AdminStats = {
  totalSets: number
  publicSets: number
  activeUsers: number
  practiceCount: number
  deltas?: {
    totalSets7d?: number
    publicSets7d?: number
    activeUsersToday?: number
    practiceToday?: number
  }
}

const quickLinks = [
  { title: '题库管理', desc: '查看与维护题库', disabled: true },
  { title: '用户管理', desc: '用户与权限配置', disabled: true },
  { title: '用户组管理', desc: '分组与权限模板', disabled: true }
]

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()

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
      <div class="vtix-panel stat-card">
        <div class="stat-title">题库总数</div>
        <div class="stat-value">{{ loading ? '—' : formatNumber(stats?.totalSets) }}</div>
        <div class="stat-meta">{{ loading ? '加载中' : metaText.totalSets }}</div>
      </div>
      <div class="vtix-panel stat-card">
        <div class="stat-title">公开题库</div>
        <div class="stat-value">{{ loading ? '—' : formatNumber(stats?.publicSets) }}</div>
        <div class="stat-meta">{{ loading ? '加载中' : metaText.publicSets }}</div>
      </div>
      <div class="vtix-panel stat-card">
        <div class="stat-title">活跃用户</div>
        <div class="stat-value">{{ loading ? '—' : formatNumber(stats?.activeUsers) }}</div>
        <div class="stat-meta">{{ loading ? '加载中' : metaText.activeUsers }}</div>
      </div>
      <div class="vtix-panel stat-card">
        <div class="stat-title">练习次数</div>
        <div class="stat-value">{{ loading ? '—' : formatNumber(stats?.practiceCount) }}</div>
        <div class="stat-meta">{{ loading ? '加载中' : metaText.practiceCount }}</div>
      </div>
    </section>

    <section class="panel-grid">
      <div class="vtix-panel">
        <div class="vtix-panel__title">快速入口</div>
        <div class="vtix-panel__content">
          <div class="quick-links">
            <div
              v-for="item in quickLinks"
              :key="item.title"
              :class="['quick-card', { disabled: item.disabled }]"
            >
              <div class="quick-title">{{ item.title }}</div>
              <div class="quick-desc">{{ item.desc }}</div>
              <div class="quick-note">即将上线</div>
            </div>
          </div>
        </div>
      </div>

      <div class="vtix-panel">
        <div class="vtix-panel__title">待办提醒</div>
        <div class="vtix-panel__content">
          <div class="todo-item">
            <div>
              <div class="todo-title">题库审核</div>
              <div class="todo-desc">有 4 个新题库等待审核发布</div>
            </div>
            <span class="todo-tag">4</span>
          </div>
          <div class="todo-item">
            <div>
              <div class="todo-title">用户反馈</div>
              <div class="todo-desc">今日收到 6 条用户反馈</div>
            </div>
            <span class="todo-tag soft">6</span>
          </div>
          <div class="todo-item">
            <div>
              <div class="todo-title">权限变更</div>
              <div class="todo-desc">请检查最近的权限调整记录</div>
            </div>
            <span class="todo-tag warning">!</span>
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
  color: #0f172a;
}

.page-head p {
  margin: 0;
  color: #6b7280;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
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
  background: #0f172a;
  color: #ffffff;
}

.tag.soft {
  background: #e2e8f0;
  color: #0f172a;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.status {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
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
  color: #64748b;
  font-weight: 600;
  font-size: 13px;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
}

.stat-meta {
  font-size: 12px;
  color: #94a3b8;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 16px;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.quick-card {
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick-card.disabled {
  opacity: 0.7;
}

.quick-title {
  font-weight: 700;
  color: #0f172a;
}

.quick-desc {
  font-size: 12px;
  color: #64748b;
}

.quick-note {
  font-size: 12px;
  color: #94a3b8;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.todo-title {
  font-weight: 700;
  color: #0f172a;
}

.todo-desc {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.todo-tag {
  min-width: 30px;
  height: 28px;
  border-radius: 999px;
  background: #0f172a;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
}

.todo-tag.soft {
  background: #e2e8f0;
  color: #0f172a;
}

.todo-tag.warning {
  background: #fef3c7;
  color: #b45309;
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
