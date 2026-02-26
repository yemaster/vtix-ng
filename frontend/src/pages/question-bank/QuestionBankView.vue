<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'
import { useRouter } from 'vue-router'
import { formatDateTime, formatRelativeTimeFromNow } from '../../utils/datetime'
import {
  queryCachedProblemSetSummaries,
  upsertCachedProblemSetSummaries
} from '../../base/problemSetCache'
import { useUserStore } from '../../stores/user'

type QuestionBankItem = {
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
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const userStore = useUserStore()

const MANAGE_QUESTION_BANK_ALL = 1 << 10

const items = ref<QuestionBankItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const totalRecords = ref(0)
const categoryItems = ref<string[]>([])
let itemsAbortController: AbortController | null = null
let categoryAbortController: AbortController | null = null
let itemsRequestId = 0

const search = ref('')
const debouncedSearch = ref('')
let searchTimer: number | null = null
const selectedCategory = ref('全部')
const MOBILE_BREAKPOINT = 648
const TABLET_BREAKPOINT = 968

function getColumnCountByWidth(width: number) {
  if (width <= MOBILE_BREAKPOINT) return 1
  if (width <= TABLET_BREAKPOINT) return 2
  return 3
}

function getPageSizeByWidth(width: number) {
  const columns = getColumnCountByWidth(width)
  if (columns === 1) return 4
  if (columns === 2) return 6
  return 9
}

const pageSize = ref(getPageSizeByWidth(typeof window === 'undefined' ? 1200 : window.innerWidth))
const currentPage = ref(1)

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

const canManageAll = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_ALL))
)

async function loadItems() {
  const requestId = ++itemsRequestId
  itemsAbortController?.abort()
  const controller = new AbortController()
  itemsAbortController = controller
  isLoading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      pageSize: String(pageSize.value),
      ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
      ...(selectedCategory.value !== '全部' ? { category: selectedCategory.value } : {})
    })
    const response = await fetch(`${apiBase}/api/problem-sets?${params.toString()}`, {
      signal: controller.signal
    })
    if (requestId !== itemsRequestId) return
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const total = Number(response.headers.get('x-total-count') ?? 0)
    totalRecords.value = Number.isFinite(total) ? total : 0
    const data = (await response.json()) as QuestionBankItem[]
    items.value = Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          creatorId: typeof item.creatorId === 'string' ? item.creatorId : String(item.creatorId ?? ''),
          categories: Array.isArray(item.categories) ? item.categories : [],
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
          updatedAt: Number(item.updatedAt ?? item.createdAt ?? 0)
        }))
      : []
    upsertCachedProblemSetSummaries(items.value)
  } catch (error) {
    if (controller.signal.aborted) return
    const cached = queryCachedProblemSetSummaries({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: debouncedSearch.value,
      category: selectedCategory.value
    })
    items.value = cached.items.map((item) => ({
      id: item.code,
      code: item.code,
      title: item.title,
      year: item.year,
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      categories: item.categories,
      questionCount: item.questionCount,
      recommendedRank: item.recommendedRank,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))
    totalRecords.value = cached.total
    loadError.value = cached.total > 0 ? '' : error instanceof Error ? error.message : '加载失败'
  } finally {
    if (requestId === itemsRequestId) {
      isLoading.value = false
    }
  }
}

async function loadCategories(options: { force?: boolean } = {}) {
  if (!options.force && categoryItems.value.length > 0) return
  categoryAbortController?.abort()
  const controller = new AbortController()
  categoryAbortController = controller
  try {
    const response = await fetch(`${apiBase}/api/problem-sets/categories`, {
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`加载分类失败: ${response.status}`)
    }
    const data = (await response.json()) as { items?: unknown[] }
    const list = Array.isArray(data.items)
      ? data.items.map((item) => String(item ?? '').trim()).filter(Boolean)
      : []
    categoryItems.value = Array.from(new Set(list))
  } catch {
    if (controller.signal.aborted) return
    // fallback handled in computed below
  }
}

const categories = computed(() => {
  const set = new Set<string>()
  if (categoryItems.value.length > 0) {
    categoryItems.value.forEach((item) => set.add(item))
  } else {
    items.value.flatMap((item) => item.categories).forEach((item) => set.add(item))
  }
  if (selectedCategory.value !== '全部') {
    set.add(selectedCategory.value)
  }
  return ['全部', ...Array.from(set)]
})

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

function handleManageClick() {
  router.push({ name: 'admin-question-banks' })
}

async function handleRefresh() {
  await Promise.all([loadItems(), loadCategories({ force: true })])
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  const changed = syncPageSizeByViewport()
  void loadCategories()
  if (!changed) {
    void loadItems()
  }
})

watch([currentPage, pageSize], () => {
  void loadItems()
})

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
  itemsAbortController?.abort()
  categoryAbortController?.abort()
  window.removeEventListener('resize', handleResize)
})

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
  }, 300)
})

watch(selectedCategory, () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1
    return
  }
  void loadItems()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">题库管理</div>
        <h1>题库列表</h1>
      </div>
      <div class="page-actions">
        <Button
          v-if="canManageAll"
          label="管理题库"
          size="small"
          severity="secondary"
          @click="handleManageClick"
        />
        <Button
          label="刷新"
          :loading="isLoading"
          severity="secondary"
          text
          size="small"
          @click="handleRefresh"
        />
      </div>
    </header>

    <div class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
      <div class="tags">
        <Button
          v-for="category in categories"
          :key="category"
          type="button"
          :label="category"
          :severity="selectedCategory === category ? 'primary' : 'secondary'"
          :outlined="selectedCategory !== category"
          size="small"
          class="tag-btn"
          @click="selectedCategory = category"
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
                <div class="pill-group">
                  <Tag v-for="category in item.categories" :key="category" :value="category" rounded />
                </div>
                <div class="card-meta">
                  <span class="meta-owner">by {{ item.creatorName || '匿名' }}</span>
                  <span class="meta-time" v-tooltip.bottom="formatFullTime(item.updatedAt ?? 0)">
                    @{{ formatRelativeTime(item.updatedAt ?? 0) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="count">
            <div class="count-value">{{ item.questionCount }}</div>
            <div class="count-label">题目数</div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!isLoading && items.length === 0" class="empty">暂无匹配题库</div>

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
  flex-direction: column;
  gap: 12px;
}

.search :deep(.p-inputtext) {
  width: 100%;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-btn :deep(.p-button) {
  border-radius: 999px;
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
}

.card.recommended::after {
  content: '';
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 3px var(--vtix-surface);
}

.card-link {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.card-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px var(--vtix-shadow-strong);
}

.card.recommended.card-link:hover {
  border-color: var(--vtix-primary-600);
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
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
}

.card-meta {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  line-height: 1.5;
}

.meta-owner,
.meta-time {
  font-weight: 400;
}

.meta-time {
  color: var(--vtix-text-muted);
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill-group :deep(.p-tag) {
  font-size: 12px;
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

@media (max-width: 968px) {
  .page-head {
    flex-direction: column;
  }

  .cards {
    column-count: 2;
  }
}

@media (max-width: 648px) {
  .cards {
    column-count: 1;
  }
}
</style>
