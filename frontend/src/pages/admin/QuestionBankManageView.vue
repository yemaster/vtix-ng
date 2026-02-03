<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'

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

const MANAGE_QUESTION_BANK_OWN = 1 << 9
const MANAGE_QUESTION_BANK_ALL = 1 << 10

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const userStore = useUserStore()

const items = ref<QuestionBankItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const deleteError = ref('')
const deletingCode = ref<string | null>(null)
const confirmCode = ref<string | null>(null)
const statusError = ref('')
const recommendError = ref('')
const recommendingCode = ref<string | null>(null)
const importError = ref('')
const exportError = ref('')
const actionMessage = ref('')
const importLoading = ref(false)
const exportLoading = ref(false)
const bulkActionLoading = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const selectedCodes = ref<string[]>([])
const bulkAction = ref('')

const search = ref('')
const selectedCategory = ref('all')
const selectedCreator = ref('all')
const pageSize = ref(8)
const currentPage = ref(1)
const pageSizeOptions = [8, 16, 32]

const canManageAll = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_ALL))
)
const canManageOwn = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_OWN))
)

const bulkActionOptions = computed(() => {
  if (canManageAll.value) {
    return [
      { label: '导出所选', value: 'export' },
      { label: '设为公开', value: 'public' },
      { label: '设为隐藏', value: 'private' },
      { label: '设为推荐', value: 'recommend' },
      { label: '取消推荐', value: 'unrecommend' },
      { label: '设为新', value: 'new' },
      { label: '取消新', value: 'not_new' },
      { label: '删除所选', value: 'delete' }
    ]
  }
  if (canManageOwn.value) {
    return [{ label: '删除所选', value: 'delete' }]
  }
  return []
})

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

const selectedCount = computed(() => selectedCodes.value.length)
const pageCodes = computed(() => pagedItems.value.map((item) => item.code))
const isPageAllSelected = computed(
  () => pageCodes.value.length > 0 && pageCodes.value.every((code) => selectedCodes.value.includes(code))
)
const isPageIndeterminate = computed(() => {
  if (pageCodes.value.length === 0) return false
  const selectedOnPage = pageCodes.value.filter((code) => selectedCodes.value.includes(code)).length
  return selectedOnPage > 0 && selectedOnPage < pageCodes.value.length
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
          questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
          isNew: Boolean(item.isNew),
          isPublic: Boolean(item.isPublic)
        }))
      : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
  } finally {
    isLoading.value = false
  }
}

function triggerImport() {
  importError.value = ''
  exportError.value = ''
  actionMessage.value = ''
  importInput.value?.click()
}

async function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  if (target) {
    target.value = ''
  }
  importLoading.value = true
  importError.value = ''
  exportError.value = ''
  actionMessage.value = ''
  try {
    const raw = await file.text()
    const payload = JSON.parse(raw)
    const response = await fetch(`${apiBase}/api/admin/problem-sets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    const data = (await response.json().catch(() => null)) as
      | { imported?: number; skipped?: number; error?: string }
      | null
    if (!response.ok) {
      throw new Error(data?.error || `导入失败: ${response.status}`)
    }
    const imported = Number(data?.imported ?? 0)
    const skipped = Number(data?.skipped ?? 0)
    actionMessage.value = `导入完成：成功 ${imported} 个，跳过 ${skipped} 个`
    await loadItems()
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败'
  } finally {
    importLoading.value = false
  }
}

async function handleExport() {
  exportLoading.value = true
  exportError.value = ''
  actionMessage.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/export`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`导出失败: ${response.status}`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `vtix-problem-sets-${date}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    actionMessage.value = '导出完成'
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败'
  } finally {
    exportLoading.value = false
  }
}

async function handleExportSelected() {
  if (!selectedCount.value) return
  bulkActionLoading.value = true
  exportError.value = ''
  actionMessage.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ codes: selectedCodes.value })
    })
    if (!response.ok) {
      throw new Error(`导出失败: ${response.status}`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `vtix-problem-sets-selected-${date}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    actionMessage.value = `导出完成：${selectedCount.value} 个题库`
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败'
  } finally {
    bulkActionLoading.value = false
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

async function handleBatchDelete() {
  if (!selectedCount.value) return
  if (!window.confirm(`确认删除已选 ${selectedCount.value} 个题库？`)) return
  deleteError.value = ''
  bulkActionLoading.value = true
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ codes: selectedCodes.value })
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(data?.error || `删除失败: ${response.status}`)
    }
    actionMessage.value = `批量删除完成：已处理 ${selectedCount.value} 个题库`
    selectedCodes.value = []
    await loadItems()
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '删除失败'
  } finally {
    bulkActionLoading.value = false
  }
}

function getNextRecommendedRank() {
  const ranks = items.value
    .map((item) => item.recommendedRank)
    .filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank))
  const maxRank = ranks.length ? Math.max(...ranks) : 0
  return maxRank + 1
}

async function updateFlags(code: string, flags: { isNew?: boolean; isPublic?: boolean }) {
  statusError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/${code}/flags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(flags)
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(data?.error || `状态更新失败: ${response.status}`)
    }
    await loadItems()
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : '状态更新失败'
  }
}

function toggleIsNew(item: QuestionBankItem) {
  void updateFlags(item.code, { isNew: !item.isNew })
}

function toggleIsPublic(item: QuestionBankItem) {
  void updateFlags(item.code, { isPublic: !item.isPublic })
}

async function handleBulkUpdate(action: string) {
  if (!selectedCount.value) return
  statusError.value = ''
  bulkActionLoading.value = true
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/batch-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        codes: selectedCodes.value,
        action
      })
    })
    const data = (await response.json().catch(() => null)) as
      | { updated?: number; skipped?: number; missing?: string[]; error?: string }
      | null
    if (!response.ok) {
      throw new Error(data?.error || `操作失败: ${response.status}`)
    }
    const updated = Number(data?.updated ?? 0)
    const skipped = Number(data?.skipped ?? 0)
    actionMessage.value = `批量操作完成：更新 ${updated} 个，跳过 ${skipped} 个`
    await loadItems()
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    bulkActionLoading.value = false
  }
}

async function handleBulkConfirm() {
  if (!bulkAction.value || !selectedCount.value) return
  if (!canManageAll.value && !canManageOwn.value) return
  if (bulkAction.value === 'export') {
    await handleExportSelected()
    return
  }
  if (bulkAction.value === 'delete') {
    await handleBatchDelete()
    return
  }
  await handleBulkUpdate(bulkAction.value)
}

async function updateRecommended(code: string, recommendedRank: number | null) {
  recommendError.value = ''
  recommendingCode.value = code
  try {
    const response = await fetch(`${apiBase}/api/admin/problem-sets/${code}/recommended`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ recommendedRank })
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(data?.error || `推荐设置失败: ${response.status}`)
    }
    await loadItems()
  } catch (error) {
    recommendError.value = error instanceof Error ? error.message : '推荐设置失败'
  } finally {
    recommendingCode.value = null
  }
}

function setRecommended(code: string) {
  const nextRank = getNextRecommendedRank()
  void updateRecommended(code, nextRank)
}

function clearRecommended(code: string) {
  void updateRecommended(code, null)
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
  const page = event.page ?? 0
  currentPage.value = page + 1
}

function toggleSelectAllOnPage(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    const next = new Set(selectedCodes.value)
    for (const code of pageCodes.value) {
      next.add(code)
    }
    selectedCodes.value = Array.from(next)
  } else {
    selectedCodes.value = selectedCodes.value.filter((code) => !pageCodes.value.includes(code))
  }
}

function toggleSelectCode(code: string) {
  if (selectedCodes.value.includes(code)) {
    selectedCodes.value = selectedCodes.value.filter((item) => item !== code)
  } else {
    selectedCodes.value = [...selectedCodes.value, code]
  }
}

watch([search, selectedCategory, selectedCreator], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})

watch(items, (value) => {
  const available = new Set(value.map((item) => item.code))
  selectedCodes.value = selectedCodes.value.filter((code) => available.has(code))
})

onMounted(() => {
  void loadItems()
})
</script>

<template>
  <section class="admin-page">
    <input
      ref="importInput"
      class="sr-only"
      type="file"
      accept="application/json,.json"
      @change="handleImportFile"
    />
    <header class="page-head">
      <div>
        <div class="eyebrow">题库管理</div>
        <h1>题库管理</h1>
        <p>统一管理题库内容，支持筛选、编辑和删除。</p>
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

    <div v-if="statusError" class="status danger">
      <div class="status-title">状态更新失败</div>
      <div class="status-detail">{{ statusError }}</div>
    </div>

    <div v-if="recommendError" class="status danger">
      <div class="status-title">推荐设置失败</div>
      <div class="status-detail">{{ recommendError }}</div>
    </div>

    <div v-if="exportError" class="status danger">
      <div class="status-title">导出失败</div>
      <div class="status-detail">{{ exportError }}</div>
    </div>

    <div v-if="importError" class="status danger">
      <div class="status-title">导入失败</div>
      <div class="status-detail">{{ importError }}</div>
    </div>

    <div v-if="actionMessage" class="status success">
      <div class="status-title">操作完成</div>
      <div class="status-detail">{{ actionMessage }}</div>
    </div>

    <section class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索标题、编号或年份" />
      </div>
      <div class="filter-group">
        <span>标签</span>
        <Select
          v-model="selectedCategory"
          :options="categoryOptions"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
        />
      </div>
      <div class="filter-group">
        <span>创建者</span>
        <Select
          v-model="selectedCreator"
          :options="creatorOptions"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
        />
      </div>
    </section>

    <section class="vtix-panel table-panel">
      <div class="vtix-panel__title">题库列表</div>
      <div class="vtix-panel__content">
        <div class="bulk-bar">
          <div class="bulk-left">
            已选 <span class="bulk-count">{{ selectedCount }}</span> 项
            <div class="bulk-actions">
              <Select
                v-model="bulkAction"
                :options="bulkActionOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="批量操作"
                size="small"
                class="bulk-select"
                :disabled="!canManageAll && !canManageOwn"
              />
              <Button
                label="确认"
                size="small"
                :loading="bulkActionLoading"
                :disabled="(!canManageAll && !canManageOwn) || selectedCount === 0 || !bulkAction"
                @click="handleBulkConfirm"
              />
            </div>
          </div>
          <div class="bulk-right">
            <Button
              v-if="canManageAll"
              label="批量导出"
              severity="secondary"
              text
              size="small"
              :loading="exportLoading"
              @click="handleExport"
            />
            <Button
              v-if="canManageAll"
              label="批量导入"
              severity="secondary"
              text
              size="small"
              :loading="importLoading"
              @click="triggerImport"
            />
            <Button label="新建题库" size="small" @click="startCreate" />
            <Button
              label="刷新"
              severity="secondary"
              text
              size="small"
              :loading="isLoading"
              @click="loadItems"
            />
          </div>
        </div>
        <div v-if="isLoading" class="table-skeleton">
          <div v-for="n in 6" :key="`row-${n}`" class="skeleton-row">
            <span class="skeleton-line lg"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
            <span class="skeleton-line sm"></span>
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
                <th class="select-col">
                  <input
                    type="checkbox"
                    :checked="isPageAllSelected"
                    :indeterminate="isPageIndeterminate"
                    @change="toggleSelectAllOnPage"
                  />
                </th>
                <th>题库</th>
                <th>编号</th>
                <th>标签</th>
                <th>创建者</th>
                <th>新</th>
                <th>推荐</th>
                <th>公开</th>
                <th>题目数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pagedItems" :key="item.code">
                <td class="select-col">
                  <input
                    type="checkbox"
                    :checked="selectedCodes.includes(item.code)"
                    @change="toggleSelectCode(item.code)"
                  />
                </td>
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
                  <button
                    v-if="canManageAll"
                    type="button"
                    class="tag-button"
                    @click="toggleIsNew(item)"
                  >
                    <Tag :value="item.isNew ? '新' : '常规'" :severity="item.isNew ? 'info' : 'secondary'" rounded />
                  </button>
                  <Tag
                    v-else
                    :value="item.isNew ? '新' : '常规'"
                    :severity="item.isNew ? 'info' : 'secondary'"
                    rounded
                  />
                </td>
                <td>
                  <button
                    v-if="canManageAll"
                    type="button"
                    class="tag-button"
                    :disabled="recommendingCode === item.code"
                    @click="item.recommendedRank === null ? setRecommended(item.code) : clearRecommended(item.code)"
                  >
                    <Tag
                      :value="item.recommendedRank === null ? '未推荐' : '推荐'"
                      :severity="item.recommendedRank === null ? 'secondary' : 'success'"
                      rounded
                    />
                  </button>
                  <Tag
                    v-else
                    :value="item.recommendedRank === null ? '未推荐' : '推荐'"
                    :severity="item.recommendedRank === null ? 'secondary' : 'success'"
                    rounded
                  />
                </td>
                <td>
                  <button
                    v-if="canManageAll"
                    type="button"
                    class="tag-button"
                    @click="toggleIsPublic(item)"
                  >
                    <Tag
                      :value="item.isPublic ? '公开' : '私有'"
                      :severity="item.isPublic ? 'success' : 'warning'"
                      rounded
                    />
                  </button>
                  <Tag
                    v-else
                    :value="item.isPublic ? '公开' : '私有'"
                    :severity="item.isPublic ? 'success' : 'warning'"
                    rounded
                  />
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
          <Paginator
            :first="(currentPage - 1) * pageSize"
            :rows="pageSize"
            :totalRecords="filteredItems.length"
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

.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px dashed #e5e7eb;
  border-radius: 12px;
  background: #f8fafc;
}

.bulk-left {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.bulk-count {
  font-weight: 800;
  color: #0f172a;
}

.bulk-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.bulk-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bulk-select {
  min-width: 180px;
}

.table-wrap {
  width: 100%;
  overflow: auto;
}

.bank-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1100px;
}

.bank-table th,
.bank-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  color: #0f172a;
}

.bank-table th.select-col,
.bank-table td.select-col {
  width: 44px;
  padding-left: 8px;
  padding-right: 8px;
  text-align: center;
}

.bank-table input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--vtix-primary-600);
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

.title-link {
  font-weight: 600;
  color: #0f172a;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.title-link:hover {
  color: var(--vtix-primary-600);
  text-decoration: underline;
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

.code-short {
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: #475569;
}

.action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tag-button {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.tag-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
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

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 0.4fr 1.3fr 1fr 1fr 0.8fr 0.6fr 0.6fr 0.6fr 0.6fr 0.8fr;
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

.status.success {
  border-color: #86efac;
  background: #ecfdf3;
  color: #166534;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
