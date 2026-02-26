<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useRouter } from 'vue-router'
import { formatDateTime, formatRelativeTimeFromNow } from '../../utils/datetime'
import { useUserStore } from '../../stores/user'
import { pushLoginRequired } from '../../utils/auth'

type PlazaItem = {
  createdAt: number | undefined
  id: number | string
  code: string
  title: string
  year: number
  creatorId?: string
  creatorName?: string
  updatedAt?: number
  recommendedRank: number | null
  categories: string[]
  questionCount: number
  viewCount: number
  likeCount: number
  dislikeCount: number
  reaction?: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const userStore = useUserStore()

const items = ref<PlazaItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const totalRecords = ref(0)
const reacting = reactive<Record<string, boolean>>({})

const search = ref('')
const debouncedSearch = ref('')
let searchTimer: number | null = null
const MOBILE_BREAKPOINT = 648
const TABLET_BREAKPOINT = 968

function getColumnCountByWidth(width: number) {
  if (width <= MOBILE_BREAKPOINT) return 1
  if (width <= TABLET_BREAKPOINT) return 2
  return 3
}

function getPageSizeByWidth(width: number) {
  const columns = getColumnCountByWidth(width)
  if (columns === 1) return 5
  if (columns === 2) return 8
  return 12
}

const pageSize = ref(getPageSizeByWidth(typeof window === 'undefined' ? 1200 : window.innerWidth))
const currentPage = ref(1)
const sortValue = ref('time')
const sortOptions = [
  { label: '按时间降序', value: 'time' },
  { label: '按热度降序', value: 'hot' },
  { label: '按喜爱降序', value: 'love' }
]

function syncPageSizeByViewport() {
  if (typeof window === 'undefined') return false
  const nextPageSize = getPageSizeByWidth(window.innerWidth)
  if (nextPageSize === pageSize.value) return false
  const firstVisibleIndex = (currentPage.value - 1) * pageSize.value
  pageSize.value = nextPageSize
  currentPage.value = Math.floor(firstVisibleIndex / nextPageSize) + 1
  return true
}

function handleResize() {
  syncPageSizeByViewport()
}

function formatFullTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  return formatDateTime(timestamp)
}

function formatRelativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  return formatRelativeTimeFromNow(timestamp)
}

async function loadItems() {
  isLoading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      pageSize: String(pageSize.value),
      ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
      order: sortValue.value
    })
    const response = await fetch(`${apiBase}/api/problem-sets/plaza?${params.toString()}`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const total = Number(response.headers.get('x-total-count') ?? 0)
    totalRecords.value = Number.isFinite(total) ? total : 0
    const data = (await response.json()) as PlazaItem[]
    items.value = Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          creatorId: typeof item.creatorId === 'string' ? item.creatorId : String(item.creatorId ?? ''),
          categories: Array.isArray(item.categories) ? item.categories : [],
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
          updatedAt: Number(item.updatedAt ?? item.createdAt ?? 0),
          viewCount: Number.isFinite(item.viewCount) ? item.viewCount : 0,
          likeCount: Number.isFinite(item.likeCount) ? item.likeCount : 0,
          dislikeCount: Number.isFinite(item.dislikeCount) ? item.dislikeCount : 0,
          reaction: Number(item.reaction ?? 0)
        }))
      : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
    totalRecords.value = 0
  } finally {
    isLoading.value = false
  }
}

function handlePage(event: PageState) {
  const page = event.page ?? 0
  currentPage.value = page + 1
}

function handleCardClick(event: MouseEvent, code: string) {
  if (event.defaultPrevented) return
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const target = `/t/${code}`
  window.setTimeout(() => {
    router.push(target)
  }, 80)
}

function handleCreateClick() {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  router.push({ name: 'admin-question-bank-create' })
}

async function handleReactionClick(event: MouseEvent, item: PlazaItem, value: number) {
  event.preventDefault()
  event.stopPropagation()
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  if (reacting[item.code]) return
  reacting[item.code] = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/problem-sets/${item.code}/reaction`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    const data = (await response.json().catch(() => null)) as
      | { reaction?: number; likeCount?: number; dislikeCount?: number; error?: string }
      | null
    if (!response.ok) {
      throw new Error(data?.error || `操作失败: ${response.status}`)
    }
    item.reaction = Number(data?.reaction ?? 0)
    item.likeCount = Number(data?.likeCount ?? item.likeCount ?? 0)
    item.dislikeCount = Number(data?.dislikeCount ?? item.dislikeCount ?? 0)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    reacting[item.code] = false
  }
}

watch([currentPage, pageSize], () => {
  void loadItems()
}, { immediate: true })

watch(search, (value) => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
  }
  isLoading.value = true
  loadError.value = ''
  searchTimer = window.setTimeout(() => {
    debouncedSearch.value = value.trim()
    if (currentPage.value !== 1) {
      currentPage.value = 1
      return
    }
    void loadItems()
  }, 800)
})

watch(sortValue, () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1
    return
  }
  void loadItems()
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  syncPageSizeByViewport()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">展示和发布你的题库</div>
        <h1>题库广场</h1>
      </div>
      <div class="page-actions">
        <Button
          v-if="userStore.user"
          text
          label="新建题库"
          size="small"
          class="action-btn primary"
          @click="handleCreateClick"
        />
        <Button
          v-else
          text
          label="登录后新建题库"
          severity="danger"
          size="small"
          class="action-btn primary"
          disabled
        />
        <Button
          label="刷新"
          :loading="isLoading"
          severity="secondary"
          text
          size="small"
          @click="loadItems"
        />
      </div>
    </header>

    <div class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
      <div class="sort">
        <Select
          v-model="sortValue"
          :options="sortOptions"
          optionLabel="label"
          optionValue="value"
          size="small"
        />
      </div>
    </div>

    <div v-if="loadError" class="status">
      <div class="status-icon">!</div>
      <div class="status-body">
        <div class="status-title">加载失败</div>
        <div class="status-detail">{{ loadError }}</div>
      </div>
      <Button label="重新加载" severity="danger" text size="small" @click="loadItems" />
    </div>

    <div class="cards">
      <article v-if="isLoading" v-for="n in pageSize" :key="`skeleton-${n}`" class="card skeleton">
        <div class="skeleton-line lg"></div>
        <div class="skeleton-line sm"></div>
        <div class="skeleton-tags">
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill"></span>
        </div>
        <div class="skeleton-count"></div>
      </article>
      <div
        v-else
        v-for="item in items"
        :key="item.id"
        :class="['card', 'card-link', 'p-ripple', { recommended: item.recommendedRank !== null }]"
        v-ripple
        @click="handleCardClick($event, item.code)"
      >
        <div class="card-top">
          <div class="card-main">
            <div class="card-title">{{ item.title }}</div>
            <div class="card-info">
              <div class="card-info-meta">
                <div v-if="item.categories.length" class="pill-group">
                  <Tag v-for="category in item.categories.slice(0, 3)" :key="category" :value="category" rounded />
                  <span v-if="item.categories.length > 3" class="pill-more">+{{ item.categories.length - 3 }}</span>
                </div>
                <div class="card-meta">
                  <div class="card-meta-line card-meta-stats">
                    <span class="meta-views-inline">
                      <span class="pi pi-eye" aria-hidden="true"></span>
                      <span>{{ item.viewCount }}</span>
                    </span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      :disabled="reacting[item.code]"
                      :class="['react-text-link', { active: item.reaction === 1 }]"
                      @click="handleReactionClick($event, item, 1)"
                      @pointerdown.stop
                    >
                      <span class="pi pi-thumbs-up" aria-hidden="true"></span>
                      <span>{{ item.likeCount }}</span>
                    </button>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      :disabled="reacting[item.code]"
                      :class="['react-text-link', 'dislike', { active: item.reaction === -1 }]"
                      @click="handleReactionClick($event, item, -1)"
                      @pointerdown.stop
                    >
                      <span class="pi pi-thumbs-down" aria-hidden="true"></span>
                      <span>{{ item.dislikeCount }}</span>
                    </button>
                  </div>
                  <div class="card-meta-line">
                    <span class="meta-owner">by {{ item.creatorName || '匿名' }}</span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span class="meta-time" v-tooltip.bottom="formatFullTime(item.updatedAt ?? 0)">
                      @{{ formatRelativeTime(item.updatedAt ?? 0) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="card-side">
            <div class="count">
              <div class="count-value">{{ item.questionCount }}</div>
              <div class="count-label">题目数</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!isLoading && items.length === 0" class="empty">暂无非公开题库</div>

    <div class="pagination">
      <Paginator
        :first="(currentPage - 1) * pageSize"
        :rows="pageSize"
        :totalRecords="totalRecords"
        template="PrevPageLink PageLinks NextPageLink"
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border-radius: 16px;
  width: 100%;
}

.status-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  display: grid;
  place-items: center;
  font-weight: 800;
}

.status-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.status-title {
  font-weight: 800;
}

.status-detail {
  font-weight: 500;
  color: var(--vtix-danger-text);
}

.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.search :deep(.p-inputtext) {
  width: 100%;
}

.search {
  flex: 1;
  min-width: 220px;
}

.sort {
  flex: 0 0 200px;
}

.sort :deep(.p-select) {
  width: 100%;
}

.cards {
  column-count: 3;
  column-gap: 16px;
}

.card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 16px 30px var(--vtix-shadow);
  position: relative;
  break-inside: avoid;
  margin-bottom: 16px;
}

.card.recommended {
  border-color: var(--vtix-primary-500);
  box-shadow: 0 16px 30px var(--vtix-shadow-accent);
}

.card-link {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px var(--vtix-shadow-strong);
}

.card.recommended.card-link:hover {
  box-shadow: 0 18px 36px var(--vtix-shadow-accent-strong);
}

.card.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--vtix-surface-2);
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.lg {
  height: 18px;
  width: 70%;
}

.skeleton-line.sm {
  width: 45%;
}

.skeleton-tags {
  display: flex;
  gap: 6px;
}

.skeleton-pill {
  width: 48px;
  height: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-count {
  width: 64px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: stretch;
  flex: 1;
}

.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.card-title {
  font-weight: 700;
  color: var(--vtix-text);
  font-size: 20px;
  line-height: 1.3;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.card-side {
  min-width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.meta-views-inline .pi,
.react-text-link .pi {
  font-size: 12px;
}

.react-text-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--vtix-text-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color 0.2s ease;
}

.react-text-link:hover {
  color: var(--vtix-text-strong);
}

.react-text-link.active {
  color: var(--vtix-primary-500);
}

.react-text-link.dislike.active {
  color: var(--vtix-danger-text);
}

.react-text-link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-info {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}

.card-info-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.card-meta {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.card-meta-line {
  display: flex;
  gap: 6px;
  align-items: center;
  line-height: 1.5;
  flex-wrap: wrap;
}

.card-meta-stats {
  color: var(--vtix-text-muted);
}

.meta-owner,
.meta-time {
  font-weight: 400;
}

.meta-owner {
  color: var(--vtix-text-subtle);
}

.meta-sep {
  color: var(--vtix-text-muted);
}

.meta-time {
  color: var(--vtix-text-muted);
}

.meta-views-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--vtix-text-muted);
  font-variant-numeric: tabular-nums;
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill-group :deep(.p-tag) {
  font-size: 12px;
}

.pill-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface-2);
  color: var(--vtix-text-muted);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.count {
  text-align: center;
  min-width: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.count-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.count-value {
  font-size: 42px;
  font-weight: 800;
  color: var(--vtix-text);
}

.empty {
  text-align: center;
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

@media (max-width: 968px) {
  .page-head {
    flex-direction: column;
  }

  .cards {
    column-count: 2;
  }

  .sort {
    flex: 1;
    min-width: 180px;
  }
}

@media (max-width: 648px) {
  .cards {
    column-count: 1;
  }

  .sort {
    flex: 1 1 100%;
  }
}
</style>
