<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import type { ChooseProblemType, ProblemType } from '../../base/ProblemTypes'
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

function hasChoices(problem: ProblemType): problem is ChooseProblemType {
  return 'choices' in problem && Array.isArray(problem.choices)
}

function getProblemChoices(problem: ProblemType) {
  return hasChoices(problem) ? Array.from(problem.choices) : []
}

function getCorrectIndices(problem: ProblemType) {
  if (problem.type === 1 || problem.type === 4) {
    return [problem.answer]
  }
  if (problem.type === 2) {
    return problem.answer
  }
  return []
}

function getUserSelectedIndices(answer: (number | string)[] | null) {
  if (!answer) return []
  return answer.filter((value): value is number => typeof value === 'number')
}

function getWrongChoiceClass(problem: ProblemType, answer: (number | string)[] | null, index: number) {
  const correct = getCorrectIndices(problem).includes(index)
  const selected = getUserSelectedIndices(answer).includes(index)
  return {
    correct: selected && correct,
    wrong: selected && !correct,
    missed: !selected && correct,
    incorrect: !correct
  }
}

function formatFillUserAnswer(answer: (number | string)[] | null) {
  if (!answer || !answer.length) return '未提交'
  return String(answer[0] ?? '') || '未提交'
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

    <Card class="wrong-list-card">
      <template #content>
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
            <label class="select-item">
              <Checkbox :binary="true" :modelValue="selectedIds.has(record.id)"
                @update:modelValue="toggleSelect(record.id)" />
            </label>
            <div class="wrong-main">
              <div class="wrong-header">
                <div class="wrong-title">
                  <div class="title-main">
                    {{ record.problem.content }}
                    <span class="type-badge">{{ getTypeLabel(record.problem) }}</span>
                  </div>
                  <div class="title-meta">
                    {{ record.testTitle || `题库 ${record.testId}` }} @ {{ formatTimestamp(record.updatedAt) }}
                  </div>
                </div>
                <Button label="删除" size="small" severity="danger" text class="delete-btn"
                  @click="() => { removeWrongProblemsByIds(userId, [record.id]); loadRecords() }" />
              </div>

              <div class="wrong-body">
                <div v-if="hasChoices(record.problem)" class="wrong-choices">
                  <div
                    v-for="(choice, idx) in getProblemChoices(record.problem)"
                    :key="`${record.id}-${idx}`"
                    :class="['wrong-choice-row', getWrongChoiceClass(record.problem, record.userAnswer, idx)]"
                  >
                    <span class="choice-label">{{ choicesLabels[idx] ?? String(idx + 1) }}. {{ choice }}</span>
                  </div>
                </div>
                <div v-else class="fill-result">
                  <div>
                    <span class="fill-label">标准答案</span>
                    <span>{{ record.problem.type === 3 ? record.problem.answer : '无需选择' }}</span>
                  </div>
                  <div>
                    <span class="fill-label">提交内容</span>
                    <span>{{ formatFillUserAnswer(record.userAnswer) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Paginator
            class="wrong-paginator"
            :first="(currentPage - 1) * pageSize"
            :rows="pageSize"
            :totalRecords="filteredRecords.length"
            template="PrevPageLink PageLinks NextPageLink"
            @page="handlePage"
          />
        </div>
      </template>
    </Card>
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
  margin: 4px 0 6px;
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
  margin-top: 4px;
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
}

.wrong-list-card {
  overflow: hidden;
}

.wrong-list-card :deep(.p-card-body) {
  gap: 0;
  padding: 0;
}

.wrong-list-card :deep(.p-card-content) {
  padding: 0;
}

.wrong-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--vtix-text-muted);
  font-size: 13px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--vtix-border);
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 18px;
}

.wrong-card + .wrong-card {
  border-top: 1px solid var(--vtix-border);
}

.wrong-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.select-item {
  display: inline-flex;
  align-items: center;
  padding-top: 2px;
}

.wrong-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.wrong-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wrong-choice-row {
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface);
  padding: 8px 10px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  color: var(--vtix-text-strong);
  font-size: 13px;
  line-height: 1.45;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.wrong-choice-row.correct {
  background: var(--vtix-success-bg);
  border-color: var(--vtix-success-solid);
}

.wrong-choice-row.wrong {
  background: var(--vtix-surface);
  border-color: var(--vtix-danger-solid);
}

.wrong-choice-row.missed {
  background: var(--vtix-warning-bg);
  border-color: var(--vtix-warning-solid);
}

.wrong-choice-row.incorrect .choice-label {
  color: var(--vtix-text-subtle);
  opacity: 0.55;
}

.choice-label {
  flex: 1;
  text-align: left;
  display: block;
  width: 100%;
}

.fill-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.fill-label {
  display: inline-block;
  min-width: 64px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.delete-btn {
  margin-left: auto;
}

.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
  padding: 32px 18px;
}

.wrong-paginator {
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.wrong-paginator :deep(.p-paginator-page),
.wrong-paginator :deep(.p-paginator-next),
.wrong-paginator :deep(.p-paginator-prev) {
  min-width: 2rem;
  height: 2rem;
}

.wrong-paginator :deep(.p-select) {
  height: 2rem;
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
