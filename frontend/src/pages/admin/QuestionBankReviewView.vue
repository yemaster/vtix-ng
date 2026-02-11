<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'

type QuestionBankItem = {
  id: number | string
  code: string
  title: string
  year: number
  categories: string[]
  creatorId: string
  creatorName: string
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()

const items = ref<QuestionBankItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const actionError = ref('')
const actionLoadingCode = ref<string | null>(null)
const deleteLoadingCode = ref<string | null>(null)

const search = ref('')
const debouncedSearch = ref('')
let searchTimer: number | null = null

const totalRecords = ref(0)
const pageSize = ref(8)
const currentPage = ref(1)
const pageSizeOptions = [8, 16, 32]

const emptyText = computed(() => (isLoading.value ? '加载中…' : '暂无审核中的题库'))

async function loadItems() {
  isLoading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      pageSize: String(pageSize.value),
      ...(debouncedSearch.value ? { q: debouncedSearch.value } : {})
    })
    const response = await fetch(`${apiBase}/api/admin/problem-sets/pending?${params.toString()}`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const total = Number(response.headers.get('x-total-count') ?? 0)
    totalRecords.value = Number.isFinite(total) ? total : 0
    const data = (await response.json()) as QuestionBankItem[]
    items.value = Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          categories: Array.isArray(item.categories) ? item.categories : []
        }))
      : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
  } finally {
    isLoading.value = false
  }
}

function startEdit(code: string) {
  router.push({ name: 'admin-question-bank-edit', params: { code } })
}

async function handleReview(code: string, action: 'approve' | 'reject') {
  actionError.value = ''
  actionLoadingCode.value = code
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/${code}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action })
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(data?.error || `操作失败: ${response.status}`)
    }
    await loadItems()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    actionLoadingCode.value = null
  }
}

async function handleDelete(code: string) {
  if (!window.confirm('确认删除该题库？')) return
  actionError.value = ''
  deleteLoadingCode.value = code
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/${code}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(data?.error || `删除失败: ${response.status}`)
    }
    await loadItems()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '删除失败'
  } finally {
    deleteLoadingCode.value = null
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

onMounted(() => {
  void loadItems()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">题库管理</div>
        <h1>审核题库</h1>
        <p>仅展示审核中题库，支持通过或拒绝。</p>
      </div>
      <div class="head-actions">
        <Button label="刷新" severity="secondary" text size="small" :loading="isLoading" @click="loadItems" />
      </div>
    </header>

    <div v-if="loadError" class="status danger">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <div v-if="actionError" class="status danger">
      <div class="status-title">操作失败</div>
      <div class="status-detail">{{ actionError }}</div>
    </div>

    <section class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
    </section>

    <section class="vtix-panel table-panel">
      <div class="vtix-panel__title">审核列表</div>
      <div class="vtix-panel__content">
        <div v-if="items.length === 0" class="empty">{{ emptyText }}</div>
        <div v-else class="table-wrap">
          <table class="bank-table">
            <thead>
              <tr>
                <th>题库</th>
                <th>编号</th>
                <th>标签</th>
                <th>创建者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.code">
                <td>
                  <div class="title-cell">
                    <RouterLink class="title-link" :to="{ name: 'test', params: { id: item.code } }">
                      {{ item.title }}
                    </RouterLink>
                    <div class="subtitle">{{ item.year }} 年</div>
                  </div>
                </td>
                <td>
                  <span class="code-short" v-tooltip.bottom="item.code">
                    {{ item.code.slice(0, 6) }}
                  </span>
                </td>
                <td>
                  <div class="tag-list">
                    <Tag v-for="category in item.categories" :key="category" :value="category" rounded />
                  </div>
                </td>
                <td>{{ item.creatorName || item.creatorId }}</td>
                <td>
                  <div class="action-group">
                    <Button
                      label="通过"
                      size="small"
                      :loading="actionLoadingCode === item.code"
                      @click="handleReview(item.code, 'approve')"
                    />
                    <Button
                      label="拒绝"
                      size="small"
                      severity="secondary"
                      :loading="actionLoadingCode === item.code"
                      @click="handleReview(item.code, 'reject')"
                    />
                    <Button label="编辑" size="small" text severity="secondary" @click="startEdit(item.code)" />
                    <Button
                      label="删除"
                      size="small"
                      text
                      severity="danger"
                      :loading="deleteLoadingCode === item.code"
                      @click="handleDelete(item.code)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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
  color: var(--vtix-text-strong);
}

.page-head p {
  margin: 0;
  color: var(--vtix-text-muted);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
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

.search :deep(.p-inputtext) {
  width: 100%;
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
  min-width: 900px;
}

.bank-table th,
.bank-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--vtix-border);
  font-size: 14px;
  color: var(--vtix-text-strong);
}

.bank-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vtix-text-subtle);
}

.title-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-link {
  font-weight: 600;
  color: var(--vtix-text-strong);
  text-decoration: none;
}

.title-link:hover {
  color: var(--vtix-primary-600);
  text-decoration: underline;
}

.subtitle {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.code-short {
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
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

.status.danger {
  border-color: var(--vtix-danger-border);
  background: var(--vtix-danger-bg);
}

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.empty {
  color: var(--vtix-text-subtle);
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
