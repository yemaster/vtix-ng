<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataView from 'primevue/dataview'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'

type NoticeItem = {
  id: string
  title: string
  authorName: string
  isPinned: boolean
  createdAt: number
  updatedAt: number
}

const router = useRouter()
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const notices = ref<NoticeItem[]>([])
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const pageSize = ref(10)
const totalRecords = ref(0)
const pageSizeOptions = [10, 20, 30]

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
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
}

async function loadNotices() {
  loading.value = true
  loadError.value = ''
  try {
    const offset = (page.value - 1) * pageSize.value
    const response = await fetch(`${apiBase}/api/notices?limit=${pageSize.value}&offset=${offset}`)
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
    const totalHeader = response.headers.get('x-total-count')
    const total = totalHeader ? Number(totalHeader) : NaN
    totalRecords.value = Number.isFinite(total)
      ? Math.max(0, total)
      : (page.value - 1) * pageSize.value + notices.value.length
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    notices.value = []
    totalRecords.value = 0
  } finally {
    loading.value = false
  }
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
  const currentPage = event.page ?? 0
  page.value = currentPage + 1
  void loadNotices()
}

onMounted(() => {
  void loadNotices()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">通知公告</div>
        <h1>公告列表</h1>
      </div>
      <div class="head-actions">
        <Button label="返回首页" severity="secondary" text @click="router.push({ name: 'home' })" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <Card v-else class="notice-card">
      <template #content>
        <div v-if="loading" class="loading">加载中...</div>
        <DataView v-else :value="notices" data-key="id" class="compact-data-view">
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
        <Paginator
          v-if="totalRecords > 0"
          class="notice-paginator"
          :first="(page - 1) * pageSize"
          :rows="pageSize"
          :totalRecords="totalRecords"
          :rowsPerPageOptions="pageSizeOptions"
          template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
          @page="handlePage"
        />
      </template>
    </Card>
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
  margin: 4px 0 6px;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.notice-card {
  overflow: hidden;
  --notice-list-x: 18px;
  --notice-list-y: 14px;
}

.notice-card :deep(.p-card-body) {
  gap: 0;
  padding: 0;
}

.notice-card :deep(.p-card-content) {
  padding: 0;
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
  position: relative;
  min-height: 58px;
  padding-block: var(--notice-list-y);
  padding-inline: var(--notice-list-x);
}

.list-row + .list-row {
  border-top: 1px solid var(--vtix-border);
}

.notice-row.pinned::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--vtix-primary-500);
}

.list-main {
  display: flex;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.list-main.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.list-title {
  max-width: 100%;
  color: var(--vtix-text-strong);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-meta {
  color: var(--vtix-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.list-main:hover .list-title {
  color: var(--vtix-primary-700);
}

.notice-paginator {
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.notice-paginator :deep(.p-paginator-page),
.notice-paginator :deep(.p-paginator-next),
.notice-paginator :deep(.p-paginator-prev) {
  min-width: 2rem;
  height: 2rem;
}

.notice-paginator :deep(.p-select) {
  height: 2rem;
}

.loading,
.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
  font-size: 13px;
  padding: 18px;
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

@media (max-width: 768px) {
  .page-head {
    flex-direction: column;
  }

  .pagination {
    justify-content: center;
  }
}
</style>
