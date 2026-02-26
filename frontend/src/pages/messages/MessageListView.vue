<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'
import { formatDateTime } from '../../utils/datetime'

type MessageItem = {
  id: number
  senderId: number
  senderName: string
  receiverId: number
  receiverName: string
  content: string
  type: number
  link: string | null
  isRead: boolean
  createdAt: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()

const items = ref<MessageItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const totalRecords = ref(0)
const unreadCount = ref(0)
const pageSize = ref(8)
const currentPage = ref(1)
const pageSizeOptions = [8, 16, 32]

const emptyText = computed(() => (isLoading.value ? '加载中…' : '暂无消息'))

function formatType(type: number) {
  if (type === 1) return '系统消息'
  return `类型 ${type}`
}

function formatTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--'
  return formatDateTime(timestamp)
}

function handleCardClick(event: MouseEvent, link: string | null) {
  if (!link) return
  if (event.defaultPrevented) return
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  router.push(link)
}

async function loadItems() {
  isLoading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      pageSize: String(pageSize.value)
    })
    const response = await fetch(`${apiBase}/api/messages?${params.toString()}`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const total = Number(response.headers.get('x-total-count') ?? 0)
    const unread = Number(response.headers.get('x-unread-count') ?? 0)
    totalRecords.value = Number.isFinite(total) ? total : 0
    unreadCount.value = Number.isFinite(unread) ? unread : 0
    const data = (await response.json()) as MessageItem[]
    items.value = Array.isArray(data)
      ? data.map((item) => ({ ...item, isRead: Boolean(item.isRead) }))
      : []
    window.dispatchEvent(new CustomEvent('messages-updated'))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
    totalRecords.value = 0
  } finally {
    isLoading.value = false
  }
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
  const page = event.page ?? 0
  currentPage.value = page + 1
}

watch([currentPage, pageSize], () => {
  void loadItems()
})

onMounted(() => {
  void loadItems()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">消息中心</div>
        <h1>我的消息</h1>
        <div class="meta-hint">未读消息 {{ unreadCount }} 条</div>
      </div>
      <div class="page-actions">
        <Button label="刷新" severity="secondary" text size="small" :loading="isLoading" @click="loadItems" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <div class="message-list">
      <article
        v-for="item in items"
        :key="item.id"
        :class="['message-card', { clickable: item.link, unread: !item.isRead }]"
        @click="handleCardClick($event, item.link)"
      >
        <div class="message-content">{{ item.content }}</div>
        <div class="message-meta">
          <Tag severity="info" rounded>{{ formatType(item.type) }}</Tag>
          <span>from @{{ item.senderName }}</span>
          <span class="meta-time">{{ formatTime(item.createdAt) }}</span>
        </div>
      </article>
      <div v-if="items.length === 0" class="empty">{{ emptyText }}</div>
    </div>

    <div class="pagination">
      <Paginator
        :first="(currentPage - 1) * pageSize"
        :rows="pageSize"
        :totalRecords="totalRecords"
        :rowsPerPageOptions="pageSizeOptions"
        template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
        @page="handlePage"
      />
    </div>
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

.page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-head h1 {
  margin: 8px 0 6px;
  font-size: 28px;
  color: var(--vtix-text-strong);
}

.page-head p {
  margin: 0;
  color: var(--vtix-text-muted);
}

.meta-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
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

.message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
}

.message-card.unread {
  border-color: var(--vtix-danger-border);
}

.message-card.clickable {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.message-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px var(--vtix-shadow-strong);
  border-color: var(--vtix-border);
}

.message-content {
  font-weight: 500;
  color: var(--vtix-text-strong);
  font-size: 15px;
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 12px;
  color: var(--vtix-text-muted);
  align-items: center;
}

.meta-time {
  color: var(--vtix-text-subtle);
}

.meta-link {
  color: var(--vtix-primary-600);
  font-weight: 500;
}

.empty {
  text-align: center;
  color: var(--vtix-text-subtle);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

.pagination :deep(.p-paginator) {
  border: none;
  background: transparent;
  gap: 8px;
}

.pagination :deep(.p-paginator-page),
.pagination :deep(.p-paginator-prev),
.pagination :deep(.p-paginator-next) {
  min-width: 32px;
  height: 32px;
  border-radius: 10px;
}

.pagination :deep(.p-paginator-pages .p-paginator-page) {
  font-size: 14px;
}

.pagination :deep(.p-paginator-rpp-select),
.pagination :deep(.p-paginator-rpp-dropdown) {
  border-radius: 8px;
}

.pagination :deep(.p-select-label),
.pagination :deep(.p-dropdown-label) {
  font-size: 12px;
  color: var(--vtix-text-muted);
  padding: 4px 8px;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
