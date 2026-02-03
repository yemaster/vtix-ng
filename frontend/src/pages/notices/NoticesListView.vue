<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'

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
        <p>查看全部公告内容与发布时间。</p>
      </div>
      <div class="head-actions">
        <Button label="返回首页" severity="secondary" outlined @click="router.push({ name: 'home' })" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section v-else class="notice-card">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="notices.length === 0" class="empty">暂无公告</div>
      <div v-else class="table-wrap">
        <table class="notice-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>发布人</th>
              <th>发布时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in notices" :key="item.id" :class="{ pinned: item.isPinned }">
              <td>
                <RouterLink class="notice-link" :to="{ name: 'notice-detail', params: { id: item.id } }">
                  <span class="notice-title">{{ item.title }}</span>
                  <Tag v-if="item.isPinned" value="置顶" severity="info" rounded />
                </RouterLink>
              </td>
              <td class="notice-meta">{{ item.authorName }}</td>
              <td class="notice-time" v-tooltip.bottom="formatFullTime(item.createdAt)">
                {{ formatFullTime(item.createdAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <template v-if="totalRecords > 0">
      <Paginator :first="(page - 1) * pageSize" :rows="pageSize" :totalRecords="totalRecords"
        :rowsPerPageOptions="pageSizeOptions" template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
        @page="handlePage" />
    </template>
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
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.table-wrap {
  overflow: auto;
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
  padding: 10px;
  border-bottom: 1px solid #e4e7ec;
  background: #f8fafc;
  position: sticky;
  top: 0;
}

.notice-table td {
  padding: 10px;
  border-bottom: 1px dashed #e4e7ec;
  vertical-align: middle;
}

.notice-table tr.pinned td {
  background: #f8fbff;
}

.notice-table tr:hover td {
  background: #f1f5f9;
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

.notice-meta,
.notice-time {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.loading,
.empty {
  color: #9aa2b2;
  text-align: center;
  font-size: 13px;
  padding: 16px 0;
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

@media (max-width: 768px) {
  .page-head {
    flex-direction: column;
  }

  .pagination {
    justify-content: center;
  }
}
</style>
