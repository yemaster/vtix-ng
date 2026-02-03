<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'

type QuestionBankItem = {
  id: number | string
  code: string
  title: string
  year: number
  creatorName?: string
  isNew: boolean
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

const search = ref('')
const selectedCategory = ref('全部')
const pageSize = ref(6)
const currentPage = ref(1)
const pageSizeOptions = [
  6,
  12
]

const canManageAll = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_ALL))
)

async function loadItems() {
  isLoading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/problem-sets`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as QuestionBankItem[]
    items.value = Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          categories: Array.isArray(item.categories) ? item.categories : [],
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0
        }))
      : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
  } finally {
    isLoading.value = false
  }
}

function handleCreateClick() {
  if (!userStore.user) {
    router.push({ name: 'login' })
    return
  }
  router.push({ name: 'admin-question-bank-create' })
}

const categories = computed(() => {
  const set = new Set(items.value.flatMap((item) => item.categories))
  return ['全部', ...Array.from(set)]
})

const filteredItems = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return items.value.filter((item) => {
    const matchKeyword =
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword) ||
      String(item.year).includes(keyword)
    const matchCategory =
      selectedCategory.value === '全部' || item.categories.includes(selectedCategory.value)
    return matchKeyword && matchCategory
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})

watch([search, selectedCategory], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
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

onMounted(() => {
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
          v-if="userStore.user"
          label="新建题库"
          size="small"
          class="action-btn primary"
          @click="handleCreateClick"
        />
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
          @click="loadItems"
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
        v-for="item in pagedItems"
        :key="item.id"
        :class="['card', 'card-link', 'p-ripple', { recommended: item.recommendedRank !== null }]"
        v-ripple
        @click="handleCardClick($event, item.code)"
      >
        <div class="card-top">
          <div class="card-main">
            <div class="card-title">{{ item.title }}</div>
            <div class="card-meta">
              <span class="meta-date">{{ item.year }} 年</span>
              <span class="meta-owner">by {{ item.creatorName || '匿名' }}</span>
            </div>
            <div class="pill-group">
              <Tag v-for="category in item.categories" :key="category" :value="category" rounded />
            </div>
          </div>
          <div class="count">
            <div class="count-value">{{ item.questionCount }}</div>
            <div class="count-label">题目数</div>
          </div>
        </div>
        <div v-if="item.isNew" class="corner-badge" aria-hidden="true"></div>
      </div>
    </div>
    <div v-if="!isLoading && pagedItems.length === 0" class="empty">暂无匹配题库</div>

    <div class="pagination">
      <Paginator
        :first="(currentPage - 1) * pageSize"
        :rows="pageSize"
        :totalRecords="filteredItems.length"
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

.status {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
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
  background: #fee2e2;
  color: #b91c1c;
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
  color: #b91c1c;
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  justify-content: start;
}

.card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
  position: relative;
}

.card.recommended {
  border-color: var(--vtix-primary-500);
  box-shadow: 0 16px 30px rgba(14, 165, 233, 0.18);
}

.card-link {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
}

.card.recommended.card-link:hover {
  box-shadow: 0 18px 36px rgba(14, 165, 233, 0.22);
}

.card.skeleton {
  position: relative;
  overflow: hidden;
  background: #f8fafc;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
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
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-count {
  width: 64px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-weight: 700;
  color: #111827;
  font-size: 20px;
  line-height: 1.3;
}

.card-meta {
  color: #9aa2b2;
  font-size: 12px;
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  line-height: 1.5;
}

.meta-owner,
.meta-date {
  font-weight: 400;
}

.meta-owner {
  color: #9aa2b2;
}

.meta-date {
  color: #6b7280;
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.pill-group :deep(.p-tag) {
  font-size: 12px;
}

.corner-badge {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-top: 32px solid #dc2626;
  border-left: 32px solid transparent;
  border-top-right-radius: 14px;
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
  color: #9aa2b2;
  margin-top: 4px;
}

.count-value {
  font-size: 42px;
  font-weight: 800;
  color: #111827;
}

.ghost,
.danger {
  border: none;
  background: transparent;
  color: #6b7280;
  padding: 0;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  transition: color 0.2s ease;
}

.ghost:hover {
  color: #111827;
}

.danger:hover {
  color: #b91c1c;
}

.empty {
  text-align: center;
  color: #9aa2b2;
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
  color: #374151;
  padding: 4px 8px;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .card-body {
    grid-template-columns: 1fr;
  }
}
</style>
