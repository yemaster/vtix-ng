<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import Tabs from 'primevue/tabs'
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
const pageSize = ref(6)
const currentPage = ref(1)

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
  void loadCategories()
  void loadItems()
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
    </div>

    <div v-if="loadError" class="status">
      <div class="status-icon">!</div>
      <div class="status-body">
        <div class="status-title">加载失败</div>
        <div class="status-detail">{{ loadError }}</div>
      </div>
      <Button label="重新加载" severity="danger" text size="small" @click="loadItems" />
    </div>

    <Card class="question-list-card">
      <template #content>
        <Tabs v-model:value="selectedCategory" scrollable class="category-tabs">
          <TabList>
            <Tab v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </Tab>
          </TabList>
        </Tabs>

        <div v-if="isLoading" class="question-list">
          <div v-for="n in pageSize" :key="`skeleton-${n}`" class="question-row skeleton">
            <div class="count skeleton-count"></div>
            <div class="question-main">
              <div class="skeleton-line lg"></div>
              <div class="skeleton-line sm"></div>
              <div class="skeleton-tags">
                <span class="skeleton-pill"></span>
                <span class="skeleton-pill"></span>
                <span class="skeleton-pill"></span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="items.length === 0" class="empty">暂无匹配题库</div>

        <div v-else class="question-list">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            :class="['question-row', 'p-ripple', { recommended: item.recommendedRank !== null }]"
            v-ripple
            @click="handleCardClick($event, item.code)"
          >
            <div class="count">
              <div class="count-value">{{ item.questionCount }}</div>
              <div class="count-label">题目数</div>
            </div>
            <div class="question-main">
              <div class="question-title">{{ item.title }}</div>
              <div class="question-info">
                <div class="pill-group">
                  <Tag v-for="category in item.categories" :key="category" :value="category" rounded />
                </div>
                <div class="question-meta">
                  <span class="meta-owner">by {{ item.creatorName || '匿名' }}</span>
                  <span class="meta-time" v-tooltip.bottom="formatFullTime(item.updatedAt ?? 0)">
                    @{{ formatRelativeTime(item.updatedAt ?? 0) }}
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>

        <Paginator
          v-if="totalRecords > 0"
          class="question-paginator"
          :first="(currentPage - 1) * pageSize"
          :rows="pageSize"
          :totalRecords="totalRecords"
          template="PrevPageLink PageLinks NextPageLink"
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

.page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}


.page-head h1 {
  margin: 4px 0 6px;
  font-size: 32px;
  color: var(--vtix-text-strong);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
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
  margin: 4px 0 8px;
}

.search :deep(.p-inputtext) {
  width: 100%;
}

.search {
  width: 100%;
}

.question-list-card {
  overflow: hidden;
}

.question-list-card :deep(.p-card-body) {
  gap: 0;
  padding: 0;
}

.question-list-card :deep(.p-card-content) {
  padding: 0;
}

.category-tabs {
  border-bottom: 1px solid var(--vtix-border);
}

.category-tabs :deep(.p-tablist-tab-list) {
  background: transparent;
  padding-left: 12px;
}

.category-tabs :deep(.p-tab) {
  padding: 10px 18px;
  font-size: 14px;
}

.question-list {
  display: flex;
  flex-direction: column;
}

.question-row {
  position: relative;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  width: 100%;
  min-height: 78px;
  padding: 22px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

button.question-row {
  cursor: pointer;
  font: inherit;
  transition: background 0.18s ease;
}

button.question-row:hover {
  background: var(--vtix-surface-2);
}

.question-row + .question-row {
  border-top: 1px solid var(--vtix-border);
}

.question-row.recommended::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: var(--vtix-primary-500);
}

.question-row.skeleton {
  overflow: hidden;
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
  width: 54px;
  height: 38px;
  border-radius: 10px;
  align-self: center;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.question-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.question-title {
  font-weight: 400;
  color: var(--vtix-text);
  font-size: 22px;
  line-height: 1.3;
  margin: 0;
}

.question-info {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding-top: 8px;
}

.question-meta {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
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
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.count-label {
  font-size: 11px;
  color: var(--vtix-text-subtle);
  margin-top: 8px;
}

.count-value {
  font-size: 29px;
  line-height: 1.05;
  font-weight: 400;
  color: var(--vtix-text);
}

.empty {
  text-align: center;
  color: var(--vtix-text-subtle);
  padding: 32px 18px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.question-paginator {
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.question-paginator :deep(.p-paginator-page),
.question-paginator :deep(.p-paginator-next),
.question-paginator :deep(.p-paginator-prev) {
  min-width: 2rem;
  height: 2rem;
}

.question-paginator :deep(.p-select) {
  height: 2rem;
}

@media (max-width: 968px) {
  .page-head {
    flex-direction: column;
  }
}

@media (max-width: 648px) {
  .page-head h1 {
    font-size: 28px;
  }

  .question-row {
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 14px;
    padding: 18px 14px;
  }

  .question-title {
    font-size: 20px;
  }

  .count-value {
    font-size: 25px;
  }
}
</style>
