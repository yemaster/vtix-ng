<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

type QuestionBankItem = {
  id: number
  code: string
  title: string
  year: number
  isNew: boolean
  recommendedRank: number | null
  categories: string[]
  questionCount: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const items = ref<QuestionBankItem[]>([])
const isLoading = ref(false)
const loadError = ref('')

const search = ref('')
const selectedCategory = ref('全部')
const pageSize = ref(6)
const currentPage = ref(1)

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

function setPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
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
        <p>集中管理题库内容，支持搜索、分类筛选与年份查看。</p>
      </div>
      <div class="page-actions">
        <button class="ghost" type="button" :disabled="isLoading" @click="loadItems">刷新</button>
      </div>
    </header>
    <div class="filters">
      <div class="search">
        <input v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
      <div class="tags">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          :class="['tag', { active: selectedCategory === category }]"
          @click="selectedCategory = category"
        >
          {{ category }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="status">
      <div class="status-icon">!</div>
      <div class="status-body">
        <div class="status-title">加载失败</div>
        <div class="status-detail">{{ loadError }}</div>
      </div>
      <button type="button" class="ghost" @click="loadItems">重新加载</button>
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
      <RouterLink
        v-else
        v-for="item in pagedItems"
        :key="item.id"
        :class="['card', 'card-link', { recommended: item.recommendedRank !== null }]"
        :to="`/t/${item.code}`"
      >
        <div class="card-top">
          <div>
            <div class="card-title">{{ item.title }}</div>
            <div class="card-meta">
              <span class="meta-date">{{ item.year }} 年</span>
              <span class="meta-owner">编号 {{ item.code }}</span>
            </div>
            <div class="pill-group">
              <span v-for="category in item.categories" :key="category" class="pill">{{ category }}</span>
            </div>
          </div>
          <div class="count">
            <div class="count-value">{{ item.questionCount }}</div>
            <div class="count-label">题目数</div>
          </div>
        </div>
        <div v-if="item.isNew" class="corner-badge" aria-hidden="true"></div>
      </RouterLink>
    </div>
    <div v-if="!isLoading && pagedItems.length === 0" class="empty">暂无匹配题库</div>

    <div class="pagination">
      <button type="button" class="ghost" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">
        上一页
      </button>
      <div class="pages">
        <button
          v-for="page in totalPages"
          :key="page"
          type="button"
          :class="['page-btn', { active: page === currentPage }]"
          @click="setPage(page)"
        >
          {{ page }}
        </button>
      </div>
      <button
        type="button"
        class="ghost"
        :disabled="currentPage === totalPages"
        @click="setPage(currentPage + 1)"
      >
        下一页
      </button>
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

.primary {
  border: none;
  border-radius: 12px;
  background: #1f2937;
  color: #ffffff;
  padding: 12px 18px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(31, 41, 55, 0.2);
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

.search input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 12px 14px;
  background: #ffffff;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  border: 1px solid #e5e7eb;
  background: #f3f4f6;
  color: #6b7280;
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}

.tag.active {
  background: #111827;
  color: #ffffff;
  border-color: #111827;
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
  border-color: #2563eb;
  box-shadow: 0 16px 30px rgba(37, 99, 235, 0.15);
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

.pill {
  background: #f3f4f6;
  color: #111827;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  height: fit-content;
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
  gap: 12px;
}

.pages {
  display: flex;
  gap: 6px;
}

.page-btn {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}

.page-btn.active {
  background: #111827;
  color: #ffffff;
  border-color: #111827;
}

.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
