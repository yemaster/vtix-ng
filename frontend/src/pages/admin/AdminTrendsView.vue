<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

type TrendSeries = {
  key: string
  label: string
  values: number[]
}

type TrendsResponse = {
  years: number[]
  series: TrendSeries[]
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()

const trends = ref<TrendsResponse | null>(null)
const loading = ref(false)
const loadError = ref('')

const maxMap = computed(() => {
  const map = new Map<string, number>()
  if (!trends.value) return map
  for (const item of trends.value.series) {
    const max = item.values.length ? Math.max(...item.values) : 0
    map.set(item.key, max)
  }
  return map
})

function barStyle(value: number, max: number) {
  if (!max) return { height: '8%' }
  const pct = Math.max(8, Math.round((value / max) * 100))
  return { height: `${pct}%` }
}

async function loadTrends() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/trends`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      router.push({ name: 'login' })
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    trends.value = (await response.json()) as TrendsResponse
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    trends.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadTrends()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">统计相关</div>
        <h1>趋势分析</h1>
        <p>查看题库、公开题库和题目数量的年度趋势。</p>
      </div>
      <div class="head-actions">
        <Button label="刷新" severity="secondary" text size="small" :loading="loading" @click="loadTrends" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section class="trend-grid">
      <div v-for="series in trends?.series || []" :key="series.key" class="vtix-panel trend-card">
        <div class="trend-title">{{ series.label }}</div>
        <div v-if="loading" class="trend-skeleton">
          <span v-for="n in 6" :key="`s-${series.key}-${n}`" class="skeleton-bar"></span>
        </div>
        <div v-else class="trend-chart">
          <div v-for="(value, index) in series.values" :key="`${series.key}-${index}`" class="bar-col">
            <div class="bar" :style="barStyle(value, maxMap.get(series.key) ?? 0)" />
            <span class="bar-value">{{ value }}</span>
          </div>
        </div>
        <div v-if="!loading" class="trend-axis">
          <span v-for="year in trends?.years || []" :key="`${series.key}-${year}`">{{ year }}</span>
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

.trend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.trend-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-title {
  font-weight: 600;
  color: #0f172a;
}

.trend-chart {
  display: grid;
  grid-auto-flow: column;
  align-items: end;
  gap: 10px;
  height: 160px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}

.bar {
  width: 18px;
  border-radius: 999px;
  background: linear-gradient(180deg, #111827, #334155);
  transition: height 0.2s ease;
}

.bar-value {
  font-size: 11px;
  color: #64748b;
}

.trend-axis {
  display: grid;
  grid-auto-flow: column;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
}

.trend-skeleton {
  display: grid;
  grid-auto-flow: column;
  align-items: end;
  gap: 10px;
  height: 160px;
}

.skeleton-bar {
  width: 18px;
  height: 60%;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
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
}
</style>
