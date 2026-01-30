<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

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
  }
}

const router = useRouter()
const STORAGE_KEY = 'vtixSave'
const records = ref<PracticeRecord[]>([])

const stats = [
    { title: '题库总量', value: '12', detail: '覆盖近三年题库', delta: '+2 本月', tone: 'indigo', progress: 72 },
    { title: '题目总数', value: '3,280', detail: '持续更新中', delta: '+120 周', tone: 'emerald', progress: 64 },
    { title: '推荐题库', value: '3', detail: '重点优先练习', delta: '重点', tone: 'amber', progress: 38 }
]

const modes = [
    { label: '顺序练习', value: 0 },
    { label: '乱序练习', value: 1 },
    { label: '自定义练习', value: 2 },
    { label: '错题回顾', value: 4 },
    { label: '模拟考试', value: 5 }
]

const timeline = [
    { name: '2025 思想道德与法治', date: '推荐 · 717 题', status: '最新', code: '2025sxdd' },
    { name: '2024 近代史纲要', date: '政治类 · 题库', status: '已整理', code: '2024jdsgy' },
    { name: '2023 校规校纪', date: '入学类 · 题库', status: '可练习', code: '2023xgxj' }
]

const recentRecords = computed(() =>
    records.value
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
)

function getModeLabel(value: number) {
    return modes.find((item) => item.value === value)?.label ?? '练习'
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

function loadRecords() {
    if (!window.localStorage) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
            records.value = parsed.filter((item) => item && typeof item.id === 'string')
        }
    } catch {
        records.value = []
    }
}

onMounted(() => {
    loadRecords()
})
</script>

<template>
  <section class="page">
    <div class="hero-card">
      <div class="eyebrow">VTIX / 题库学习面板</div>
      <h1>聚合题库与练习进度，一站式备考</h1>
      <p>
        统一管理题库、练习与错题复盘，快速定位薄弱点，提升答题效率。
      </p>
      <div class="hero-actions">
        <Button label="进入题库" @click="router.push({ name: 'question-bank' })" />
        <Button label="开始练习" severity="secondary" outlined @click="router.push({ name: 'question-bank' })" />
      </div>
      <div class="hero-meta">
        <div>
          <div class="meta-label">今日练习</div>
          <div class="meta-value">86</div>
        </div>
        <div>
          <div class="meta-label">已掌握题目</div>
          <div class="meta-value">1,204</div>
        </div>
        <div>
          <div class="meta-label">正确率提升</div>
          <div class="meta-value positive">+6.8%</div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div v-for="stat in stats" :key="stat.title" class="stat-card">
        <div class="stat-top">
          <div class="stat-label">{{ stat.title }}</div>
          <span :class="['stat-tag', `is-${stat.tone}`]">{{ stat.delta }}</span>
        </div>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-detail">{{ stat.detail }}</div>
        <div class="stat-bar">
          <span :style="{ width: `${stat.progress}%` }" :class="`is-${stat.tone}`"></span>
        </div>
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
        <ul class="timeline">
          <li v-for="item in timeline" :key="item.name" class="timeline-item">
            <RouterLink class="timeline-link" :to="`/t/${item.code}`">
              <div>
                <div class="timeline-name">{{ item.name }}</div>
                <div class="timeline-date">{{ item.date }}</div>
              </div>
              <Tag :value="item.status" severity="secondary" rounded />
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
}

.hero-card {
  background: linear-gradient(135deg, #f7f8fa 0%, #ffffff 40%, #f4f5f7 100%);
  border: 1px solid #e4e7ec;
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
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

.hero-actions.p-button {
  border-radius: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hero-actions.p-button:not(.p-button-outlined) {
  background: #1f2937;
  border-color: #1f2937;
  box-shadow: 0 10px 25px rgba(31, 41, 55, 0.2);
}

.hero-actions :deep(.p-button-outlined) {
  color: #1f2937;
  border-color: #d1d5db;
}

.hero-actions :deep(.p-button:hover) {
  transform: translateY(-1px);
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

.stat-card {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.06);
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
  background: #eef2ff;
  color: #4338ca;
  border-color: #c7d2fe;
}

.stat-tag.is-emerald {
  background: #ecfdf3;
  color: #047857;
  border-color: #6ee7b7;
}

.stat-tag.is-amber {
  background: #fff7ed;
  color: #b45309;
  border-color: #fed7aa;
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

.stat-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #f1f5f9;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.stat-bar span {
  display: block;
  height: 100%;
  background: #94a3b8;
  border-radius: inherit;
}

.stat-bar span.is-indigo {
  background: linear-gradient(90deg, #818cf8, #4338ca);
}

.stat-bar span.is-emerald {
  background: linear-gradient(90deg, #34d399, #059669);
}

.stat-bar span.is-amber {
  background: linear-gradient(90deg, #fbbf24, #d97706);
}

.panel-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.panel {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.06);
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
  color: #2563eb;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
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
  border: 1px dashed #e4e7ec;
  border-radius: 10px;
  padding: 12px;
}

.record-row:hover {
  border-color: #cbd5f5;
  background: #f1f5ff;
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
}

.timeline-item {
  padding: 12px;
  border-radius: 10px;
  background: #f7f8fa;
  border: 1px dashed #e4e7ec;
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

@media (max-width: 768px) {
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
}
</style>
