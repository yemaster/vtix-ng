<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'

type NoticeDetail = {
  id: string
  title: string
  content: string
  authorName: string
  createdAt: number
  updatedAt: number
}

const route = useRoute()
const router = useRouter()
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const loading = ref(false)
const loadError = ref('')
const notice = ref<NoticeDetail | null>(null)

const createdTimeText = computed(() => formatFullTime(notice.value?.createdAt ?? 0))

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

async function loadNotice() {
  const id = String(route.params.id ?? '').trim()
  if (!id) {
    loadError.value = '缺少公告编号'
    notice.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/notices/${id}`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as NoticeDetail
    if (!data || !data.title) {
      throw new Error('公告不存在')
    }
    notice.value = {
      id: String(data.id ?? id),
      title: data.title,
      content: data.content ?? '',
      authorName: data.authorName ?? '管理员',
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0)
    }
  } catch (error) {
    notice.value = null
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadNotice()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">通知公告</div>
        <h1>公告详情</h1>
        <p>查看公告内容与发布信息。</p>
      </div>
      <div class="head-actions">
        <Button label="返回" severity="secondary" outlined @click="router.back()" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section v-else class="notice-card">
      <div v-if="loading" class="notice-skeleton">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line meta"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block short"></div>
      </div>
      <div v-else-if="notice" class="notice-content">
        <h2>{{ notice.title }}</h2>
        <div class="notice-meta">
          <span>发布人：{{ notice.authorName }}</span>
          <span>发布时间：{{ createdTimeText }}</span>
        </div>
        <div class="notice-body">{{ notice.content }}</div>
      </div>
      <div v-else class="empty">暂无公告</div>
    </section>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.notice-card {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 30px rgba(15, 23, 42, 0.08);
  min-height: 220px;
}

.notice-content h2 {
  margin: 0 0 12px;
  font-size: 24px;
  color: #0f172a;
}

.notice-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 18px;
}

.notice-body {
  white-space: pre-wrap;
  line-height: 1.7;
  color: #1f2937;
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

.notice-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.title {
  height: 22px;
  width: 55%;
}

.skeleton-line.meta {
  width: 35%;
}

.skeleton-block {
  height: 120px;
  border-radius: 12px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-block.short {
  height: 80px;
}

.empty {
  color: #9aa2b2;
  text-align: center;
  font-size: 13px;
  padding: 12px 0;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 768px) {
  .page-head {
    flex-direction: column;
  }

  .notice-card {
    padding: 18px;
  }
}
</style>
