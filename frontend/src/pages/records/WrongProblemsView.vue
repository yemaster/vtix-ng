<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import type { ProblemType } from '../../base/ProblemTypes'
import {
  getWrongProblemsByUser,
  mergeWrongProblemsByUser,
  removeAllWrongProblemsByUser,
  removeWrongProblemsByIds,
  type WrongProblemRecord
} from '../../base/wrongProblems'

const userStore = useUserStore()
const records = ref<WrongProblemRecord[]>([])
const selectedIds = ref<Set<string>>(new Set())
const importInput = ref<HTMLInputElement | null>(null)
const toast = useToast()
const keyword = ref('')
const selectedTest = ref('全部')
const selectedType = ref('全部')
const pageSize = ref(6)
const currentPage = ref(1)

const userId = computed(() => userStore.user?.id ?? 'guest')

const typeOptions = [
  { label: '全部', value: '全部' },
  { label: '单选题', value: '1' },
  { label: '多选题', value: '2' },
  { label: '填空题', value: '3' },
  { label: '判断题', value: '4' },
  { label: '送分题', value: '0' }
]

function loadRecords() {
  records.value = getWrongProblemsByUser(userId.value).sort((a, b) => b.updatedAt - a.updatedAt)
  selectedIds.value = new Set()
}

watch(userId, () => {
  loadRecords()
})

onMounted(() => {
  loadRecords()
})

const testOptions = computed(() => {
  const set = new Map<string, string>()
  records.value.forEach((record) => {
    const label = record.testTitle || `题库 ${record.testId}`
    if (!set.has(record.testId)) set.set(record.testId, label)
  })
  return [{ label: '全部', value: '全部' }].concat(
    Array.from(set.entries()).map(([value, label]) => ({ label, value }))
  )
})

const filteredRecords = computed(() => {
  const keywordValue = keyword.value.trim().toLowerCase()
  return records.value.filter((record) => {
    const matchesTest = selectedTest.value === '全部' || record.testId === selectedTest.value
    const matchesType =
      selectedType.value === '全部' || String(record.problem.type) === selectedType.value
    const content = record.problem.content?.toLowerCase?.() ?? ''
    const title = record.testTitle?.toLowerCase?.() ?? ''
    const matchesKeyword = !keywordValue || content.includes(keywordValue) || title.includes(keywordValue)
    return matchesTest && matchesType && matchesKeyword
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize.value)))
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRecords.value.slice(start, start + pageSize.value)
})

watch([keyword, selectedTest, selectedType], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})

const selectedCount = computed(() => selectedIds.value.size)
const allSelected = computed(
  () => filteredRecords.value.length > 0 && selectedIds.value.size === filteredRecords.value.length
)

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
    return
  }
  selectedIds.value = new Set(filteredRecords.value.map((record) => record.id))
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function handleDeleteSelected() {
  if (!selectedIds.value.size) return
  removeWrongProblemsByIds(userId.value, Array.from(selectedIds.value))
  loadRecords()
}

function handleDeleteAll() {
  removeAllWrongProblemsByUser(userId.value)
  loadRecords()
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatFileTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}-${hours}${minutes}`
}

function exportWrongProblems() {
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    records: getWrongProblemsByUser(userId.value)
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `vtix-wrong-problems-${formatFileTimestamp(Date.now())}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function triggerImport() {
  importInput.value?.click()
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const rawRecords = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.wrongProblems)
      ? parsed.wrongProblems
      : parsed?.record
      ? [parsed.record]
      : parsed?.wrongProblem
      ? [parsed.wrongProblem]
      : []
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '未识别到错题数据',
        life: 3000
      })
      return
    }
    const merged = mergeWrongProblemsByUser(userId.value, rawRecords)
    loadRecords()
    toast.add({
      severity: 'success',
      summary: '导入完成',
      detail: `成功合并 ${merged.length} 条错题`,
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: '文件解析失败或格式不支持',
      life: 3500
    })
  } finally {
    input.value = ''
  }
}

function handlePage(event: PageState) {
  const page = event.page ?? 0
  currentPage.value = page + 1
}

const choicesLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function getTypeLabel(problem: ProblemType) {
  const map = ['送分题', '单选题', '多选题', '填空题', '判断题']
  return map[problem.type] ?? '题目'
}

function formatChoiceAnswer(problem: ProblemType, answers: number[]) {
  if (!('choices' in problem)) return ''
  return answers
    .map((index) => {
      const label = choicesLabels[index] ?? String(index + 1)
      const content = problem.choices?.[index] ?? ''
      return `${label}.${content}`
    })
    .join('，')
}

function formatCorrectAnswer(problem: ProblemType) {
  if (problem.type === 3) {
    return problem.answer
  }
  if (Array.isArray(problem.answer)) {
    return formatChoiceAnswer(problem, problem.answer)
  }
  return formatChoiceAnswer(problem, [problem.answer])
}

function formatUserAnswer(problem: ProblemType, answer: (number | string)[] | null) {
  if (!answer || !answer.length) return '未作答'
  if (problem.type === 3) {
    return String(answer[0] ?? '')
  }
  const numbers = answer.filter((value): value is number => typeof value === 'number')
  if (!numbers.length) return '未作答'
  return formatChoiceAnswer(problem, numbers)
}
</script>

<template>
  <section class="wrong-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">错题管理</div>
        <h1>我的错题</h1>
      </div>
      <div class="page-actions">
        <Button label="导出" severity="secondary" text size="small" @click="exportWrongProblems" />
        <Button label="导入" severity="secondary" text size="small" @click="triggerImport" />
        <input ref="importInput" class="record-file" type="file" accept="application/json" @change="handleImport" />
      </div>
    </header>

    <div class="filters">
      <InputText v-model="keyword" placeholder="搜索题库或题目内容" />
      <Select v-model="selectedTest" :options="testOptions" optionLabel="label" optionValue="value" />
      <Select v-model="selectedType" :options="typeOptions" optionLabel="label" optionValue="value" />
    </div>

    <div v-if="filteredRecords.length === 0" class="empty">暂无错题</div>

    <div v-else class="wrong-list">
      <div class="wrong-toolbar">
        <div class="toolbar-info">
          <label class="select-all">
            <Checkbox :binary="true" :modelValue="allSelected" @update:modelValue="toggleSelectAll" />
            <span>全选</span>
          </label>
          <span class="selected-count">已选 {{ selectedCount }} 项</span>
        </div>
        <div class="toolbar-actions">
          <Button label="删除选中" size="small" severity="danger" text :disabled="selectedCount === 0"
            @click="handleDeleteSelected" />
          <Button label="全部清空" size="small" severity="danger" outlined @click="handleDeleteAll" />
        </div>
      </div>

      <div v-for="record in pagedRecords" :key="record.id" class="wrong-card">
        <div class="wrong-header">
          <label class="select-item">
            <Checkbox :binary="true" :modelValue="selectedIds.has(record.id)"
              @update:modelValue="toggleSelect(record.id)" />
          </label>
          <div class="wrong-title">
            <div class="title-main">
              {{ record.problem.content }}
              <span class="type-badge">{{ getTypeLabel(record.problem) }}</span>
            </div>
            <div class="title-meta">{{ formatTimestamp(record.updatedAt) }}</div>
          </div>
          <Button label="删除" size="small" severity="danger" text class="delete-btn"
            @click="() => { removeWrongProblemsByIds(userId, [record.id]); loadRecords() }" />
        </div>

        <div class="wrong-body">
          <div class="wrong-answers">
            <div>
              <span class="answer-label">正确答案：</span>
              <span>{{ formatCorrectAnswer(record.problem) }}</span>
            </div>
            <div>
              <span class="answer-label">作答：</span>
              <span>{{ formatUserAnswer(record.problem, record.userAnswer) }}</span>
            </div>
            <div>
              <span class="answer-label">来源：</span>
              <span>{{ record.testTitle || `题库 ${record.testId}` }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="pagination">
        <Paginator
          :first="(currentPage - 1) * pageSize"
          :rows="pageSize"
          :totalRecords="filteredRecords.length"
          template="PrevPageLink PageLinks NextPageLink"
          @page="handlePage"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.wrong-page {
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
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.record-file {
  display: none;
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

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) minmax(140px, 180px);
  gap: 12px;
}

.filters :deep(.p-inputtext),
.filters :deep(.p-select),
.filters :deep(.p-dropdown) {
  width: 100%;
}

.wrong-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wrong-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.toolbar-info {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.selected-count {
  color: var(--vtix-text-subtle);
}

.wrong-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wrong-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.select-item {
  display: inline-flex;
  align-items: center;
}

.wrong-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-main {
  font-weight: 700;
  color: var(--vtix-text-strong);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.type-badge {
  background: var(--vtix-surface-3);
  color: var(--vtix-text-muted);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.title-meta {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.wrong-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wrong-content {
  color: var(--vtix-text-strong);
  font-size: 14px;
  white-space: pre-wrap;
}

.wrong-answers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.answer-label {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.delete-btn {
  margin-left: auto;
}

.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
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

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .wrong-header {
    flex-wrap: wrap;
  }

  .toolbar-actions {
    flex-wrap: wrap;
  }
}
</style>
