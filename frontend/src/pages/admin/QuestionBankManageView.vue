<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'

type QuestionBankItem = {
  id: number | string
  code: string
  title: string
  year: number
  isNew: boolean
  recommendedRank: number | null
  categories: string[]
  questionCount: number
  creatorId: string
  creatorName: string
  isPublic: boolean
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()

const items = ref<QuestionBankItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const deleteError = ref('')
const deletingCode = ref<string | null>(null)
const confirmCode = ref<string | null>(null)

const search = ref('')
const selectedCategory = ref('all')
const selectedCreator = ref('all')
const pageSize = ref(8)
const currentPage = ref(1)

const categoryOptions = computed(() => {
  const set = new Set(items.value.flatMap((item) => item.categories))
  return [{ label: '全部', value: 'all' }, ...Array.from(set).map((item) => ({ label: item, value: item }))]
})

const creatorOptions = computed(() => {
  const map = new Map<string, string>()
  for (const item of items.value) {
    map.set(item.creatorId, item.creatorName || item.creatorId)
  }
  const options = Array.from(map.entries()).map(([value, label]) => ({ label, value }))
  return [{ label: '全部', value: 'all' }, ...options]
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
      selectedCategory.value === 'all' || item.categories.includes(selectedCategory.value)
    const matchCreator = selectedCreator.value === 'all' || item.creatorId === selectedCreator.value
    return matchKeyword && matchCategory && matchCreator
  })
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value))
)

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})

async function loadItems() {
  isLoading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets`, {
      credentials: 'include'
    })
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

function startCreate() {
  router.push({ name: 'admin-question-bank-create' })
}

function startEdit(code: string) {
  router.push({ name: 'admin-question-bank-edit', params: { code } })
}

async function confirmDelete(code: string) {
  deleteError.value = ''
  deletingCode.value = code
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/${code}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`删除失败: ${response.status}`)
    }
    await loadItems()
    confirmCode.value = null
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '删除失败'
  } finally {
    deletingCode.value = null
  }
}

watch([search, selectedCategory, selectedCreator, pageSize], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})

onMounted(() => {
  void loadItems()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">题库管理</div>
        <h1>题库管理</h1>
        <p>统一管理题库内容，支持筛选、编辑和删除。</p>
      </div>
      <div class="head-actions">
        <Button label="新建题库" size="small" @click="startCreate" />
        <Button label="刷新" severity="secondary" text size="small" :loading="isLoading" @click="loadItems" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <div v-if="deleteError" class="status danger">
      <div class="status-title">删除失败</div>
      <div class="status-detail">{{ deleteError }}</div>
    </div>

    <section class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
      <div class="filter-group">
        <span>标签</span>
        <Dropdown
          v-model="selectedCategory"
          :options="categoryOptions"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
        />
      </div>
      <div class="filter-group">
        <span>创建者</span>
        <Dropdown
          v-model="selectedCreator"
          :options="creatorOptions"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
        />
      </div>
      <div class="filter-group">
        <span>每页</span>
        <Dropdown
          v-model="pageSize"
          :options="[{ label: '8', value: 8 }, { label: '16', value: 16 }, { label: '32', value: 32 }]"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
        />
      </div>
    </section>

    <section class="vtix-panel table-panel">
      <div class="vtix-panel__title">题库列表</div>
      <div class="vtix-panel__content">
        <div v-if="isLoading" class="table-skeleton">
          <div v-for="n in 6" :key="`row-${n}`" class="skeleton-row">
            <span class="skeleton-line lg"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
          </div>
        </div>
        <div v-else-if="filteredItems.length === 0" class="empty">暂无题库</div>
        <div v-else class="table-wrap">
          <table class="bank-table">
            <thead>
              <tr>
                <th>题库</th>
                <th>编号</th>
                <th>标签</th>
                <th>创建者</th>
                <th>公开</th>
                <th>题目数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pagedItems" :key="item.code">
                <td>
                  <div class="title-cell">
                    <div class="title">{{ item.title }}</div>
                    <div class="subtitle">{{ item.year }} 年</div>
                  </div>
                </td>
                <td>{{ item.code }}</td>
                <td>
                  <div class="tag-list">
                    <Tag v-for="category in item.categories" :key="category" :value="category" rounded />
                  </div>
                </td>
                <td>{{ item.creatorName || item.creatorId }}</td>
                <td>
                  <span :class="['pill', item.isPublic ? 'public' : 'private']">
                    {{ item.isPublic ? '公开' : '私有' }}
                  </span>
                </td>
                <td>{{ item.questionCount }}</td>
                <td>
                  <div class="action-group">
                    <Button label="编辑" size="small" text severity="secondary" @click="startEdit(item.code)" />
                    <div class="delete-popover">
                      <Button
                        label="删除"
                        size="small"
                        text
                        severity="danger"
                        @click="confirmCode = confirmCode === item.code ? null : item.code"
                      />
                      <div v-if="confirmCode === item.code" class="popover-card">
                        <div class="popover-title">确认删除该题库？</div>
                        <div class="popover-actions">
                          <Button
                            label="确认"
                            size="small"
                            severity="danger"
                            :loading="deletingCode === item.code"
                            @click="confirmDelete(item.code)"
                          />
                          <Button label="取消" size="small" text severity="secondary" @click="confirmCode = null" />
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <Button
            label="上一页"
            severity="secondary"
            text
            size="small"
            :disabled="currentPage === 1"
            @click="currentPage -= 1"
          />
          <div class="pages">
            <Button
              v-for="page in totalPages"
              :key="page"
              type="button"
              :label="String(page)"
              :severity="page === currentPage ? 'contrast' : 'secondary'"
              :outlined="page !== currentPage"
              size="small"
              class="page-btn"
              @click="currentPage = page"
            />
          </div>
          <Button
            label="下一页"
            severity="secondary"
            text
            size="small"
            :disabled="currentPage === totalPages"
            @click="currentPage += 1"
          />
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
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

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search {
  flex: 1;
  min-width: 220px;
}

.filter-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.filter-select {
  min-width: 160px;
}

.table-panel :deep(.vtix-panel__content) {
  gap: 16px;
}

.table-wrap {
  width: 100%;
  overflow: auto;
}

.bank-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}

.bank-table th,
.bank-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  color: #0f172a;
}

.bank-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.title-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-weight: 600;
}

.subtitle {
  font-size: 12px;
  color: #64748b;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #e2e8f0;
  color: #0f172a;
}

.pill.public {
  background: #e0f2fe;
  color: #0369a1;
}

.pill.private {
  background: #fef3c7;
  color: #b45309;
}

.action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.delete-popover {
  position: relative;
}

.popover-card {
  position: absolute;
  top: 32px;
  right: 0;
  width: 200px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  padding: 10px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.popover-title {
  font-size: 13px;
  color: #0f172a;
}

.popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

.page-btn :deep(.p-button) {
  border-radius: 10px;
  font-size: 14px;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr 0.8fr 0.6fr 0.6fr;
  gap: 12px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.lg {
  height: 16px;
}

.skeleton-line.sm {
  width: 100%;
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

.status.danger {
  border-color: #fca5a5;
  background: #fef2f2;
}

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.empty {
  color: #94a3b8;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .filters {
    align-items: stretch;
  }

  .filter-group {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
