<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import RadioButton from 'primevue/radiobutton'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import type { ProblemType } from '../../base/ProblemTypes'
import * as XLSX from 'xlsx'

type ProblemDraft = {
  id: string
  type: number
  content: string
  choices: string[]
  answerSingle: number | null
  answerMulti: number[]
  answerText: string
  hint: string
}

type ProblemPayload = ProblemType & { hint?: string }

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const userStore = useUserStore()
const toast = useToast()

const MANAGE_QUESTION_BANK_ALL = 1 << 10

const title = ref('')
const year = ref(new Date().getFullYear())
const categoriesText = ref('')
const isPublic = ref(false)
const inviteCode = ref('')

const problems = ref<ProblemDraft[]>([])
const selectedProblemId = ref<string | null>(null)
const submitError = ref('')
const submitLoading = ref(false)

const editorTabs = [
  { label: '手动编辑', value: 'manual' },
  { label: '文件导入解析', value: 'import' }
]
const activeEditorTab = ref<'manual' | 'import'>('manual')
const editorTabItems = editorTabs.map((tab) => ({
  label: tab.label,
  command: () => {
    activeEditorTab.value = tab.value as 'manual' | 'import'
  }
}))
const activeEditorTabIndex = computed(
  () => editorTabs.findIndex((item) => item.value === activeEditorTab.value)
)

const importInput = ref<HTMLInputElement | null>(null)
const importFile = ref<File | null>(null)
const importError = ref('')
const importParsing = ref(false)
const importStats = ref({ total: 0, parsed: 0, skipped: 0 })
const useHeaderRow = ref(true)
const parserCode = ref(`// row 为当前行数据
// useHeaderRow = true 时，row 为对象；否则为数组
// 返回 null/undefined 表示跳过该行
return {
  title: row['title'] ?? row[0],
  type: 1,
  choices: [row['A'], row['B'], row['C'], row['D']].filter(Boolean),
  answer: "ABCDEFG".indexOf(row['answer']),
  hint: row['hint'] ?? ''
}
`)

const canManage = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_ALL))
)

const typeOptions = [
  { label: '单选题', value: 1 },
  { label: '多选题', value: 2 },
  { label: '填空题', value: 3 },
  { label: '判断题', value: 4 }
]

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createProblem(type = 1): ProblemDraft {
  const choices = type === 4 ? ['正确', '错误'] : type === 3 ? [] : ['', '', '', '']
  return {
    id: createId(),
    type,
    content: '',
    choices,
    answerSingle: null,
    answerMulti: [],
    answerText: '',
    hint: ''
  }
}

function addProblem(type = 1) {
  const item = createProblem(type)
  problems.value.push(item)
  selectedProblemId.value = item.id
}

function removeProblem(index: number) {
  const removed = problems.value.splice(index, 1)
  if (!removed.length) return
  if (selectedProblemId.value === removed[0].id) {
    selectedProblemId.value = problems.value[0]?.id ?? null
  }
}

function updateType(problem: ProblemDraft, nextType: number) {
  problem.type = nextType
  problem.content = ''
  problem.hint = ''
  problem.answerSingle = null
  problem.answerMulti = []
  problem.answerText = ''
  if (nextType === 3) {
    problem.choices = []
  } else if (nextType === 4) {
    problem.choices = ['正确', '错误']
  } else {
    problem.choices = ['', '', '', '']
  }
}

function addChoice(problem: ProblemDraft) {
  problem.choices.push('')
}

function removeChoice(problem: ProblemDraft, index: number) {
  problem.choices.splice(index, 1)
  if (problem.answerSingle !== null && problem.answerSingle >= problem.choices.length) {
    problem.answerSingle = null
  }
  problem.answerMulti = problem.answerMulti.filter((value) => value < problem.choices.length)
}

function toggleMultiAnswer(problem: ProblemDraft, index: number) {
  const set = new Set(problem.answerMulti)
  if (set.has(index)) {
    set.delete(index)
  } else {
    set.add(index)
  }
  problem.answerMulti = Array.from(set).sort((a, b) => a - b)
}

function normalizeChoices(list: string[]) {
  return list.map((item) => item.trim())
}

function buildProblemPayload(problem: ProblemDraft): ProblemPayload | null {
  const content = problem.content.trim()
  if (!content) return null
  const hint = problem.hint.trim()
  if (problem.type === 3) {
    const answer = problem.answerText.trim()
    if (!answer) return null
    return hint ? { type: 3, content, answer, hint } : { type: 3, content, answer }
  }
  const choices = normalizeChoices(problem.choices)
  if (choices.length < 2 || choices.some((item) => !item)) return null
  if (problem.type === 2) {
    const answer = problem.answerMulti.filter((value) => value >= 0 && value < choices.length)
    if (!answer.length) return null
    return hint ? { type: 2, content, choices, answer, hint } : { type: 2, content, choices, answer }
  }
  const answer = problem.answerSingle
  if (answer === null || answer < 0 || answer >= choices.length) return null
  if (problem.type === 4) {
    const pair: [string, string] = [choices[0], choices[1]]
    return hint ? { type: 4, content, choices: pair, answer, hint } : { type: 4, content, choices: pair, answer }
  }
  return hint ? { type: 1, content, choices, answer, hint } : { type: 1, content, choices, answer }
}

function parseCsv(text: string) {
  const rows: string[][] = []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const delimiter = lines[0]?.includes(';') && !lines[0]?.includes(',') ? ';' : ','
  for (const line of lines) {
    if (!line.trim()) continue
    const row: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      const next = line[i + 1]
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (char === delimiter && !inQuotes) {
        row.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    row.push(current.trim())
    rows.push(row)
  }
  return rows
}

function normalizeType(value: unknown) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return 1
  if (['1', '单选', '单选题', 'single', 'radio'].includes(text)) return 1
  if (['2', '多选', '多选题', 'multiple', 'multi'].includes(text)) return 2
  if (['3', '填空', '填空题', 'blank'].includes(text)) return 3
  if (['4', '判断', '判断题', 'truefalse', 'judge'].includes(text)) return 4
  return 1
}

function splitChoices(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  if (!text) return []
  const delimiter = text.includes('|')
    ? '|'
    : text.includes(';')
    ? ';'
    : text.includes('/')
    ? '/'
    : ','
  return text.split(delimiter).map((item) => item.trim()).filter(Boolean)
}

function parseChoiceIndex(value: unknown, choices: string[]) {
  if (typeof value === 'number') {
    if (value >= 0 && value < choices.length) return value
    if (value > 0 && value <= choices.length) return value - 1
  }
  const text = String(value ?? '').trim().toUpperCase()
  if (!text) return null
  if (['正确', '对', 'TRUE', 'T', 'YES', 'Y'].includes(text)) return 0
  if (['错误', '错', 'FALSE', 'F', 'NO', 'N'].includes(text)) return 1
  const letter = text[0]
  const index = letter.charCodeAt(0) - 'A'.charCodeAt(0)
  if (index >= 0 && index < choices.length) return index
  const numeric = Number(text)
  if (Number.isFinite(numeric)) {
    if (numeric >= 0 && numeric < choices.length) return numeric
    if (numeric > 0 && numeric <= choices.length) return numeric - 1
  }
  return null
}

function parseMultiAnswer(value: unknown, choices: string[]) {
  if (Array.isArray(value)) {
    return value
      .map((item) => parseChoiceIndex(item, choices))
      .filter((item): item is number => item !== null)
  }
  const text = String(value ?? '').trim()
  if (!text) return []
  const parts = text.split(/[,;|/]/).map((item) => item.trim()).filter(Boolean)
  return parts
    .map((item) => parseChoiceIndex(item, choices))
    .filter((item): item is number => item !== null)
}

function createProblemDraftFromResult(result: any): ProblemDraft | null {
  if (!result || typeof result !== 'object') return null
  const content = String(result.content ?? result.title ?? '').trim()
  if (!content) return null
  const type = normalizeType(result.type)
  const hint = String(result.hint ?? result.analysis ?? result.explain ?? '').trim()
  if (type === 3) {
    const answerText = String(result.answer ?? result.answerText ?? '').trim()
    if (!answerText) return null
    return {
      id: createId(),
      type,
      content,
      choices: [],
      answerSingle: null,
      answerMulti: [],
      answerText,
      hint
    }
  }
  let choices = splitChoices(result.choices ?? result.options ?? result.choice)
  if (type === 4 && choices.length < 2) {
    choices = ['正确', '错误']
  }
  const finalChoices = type === 4 ? choices.slice(0, 2) : choices
  if (choices.length < 2) return null
  if (type === 2) {
    const answerMulti = parseMultiAnswer(result.answer, finalChoices)
    if (!answerMulti.length) return null
    return {
      id: createId(),
      type,
      content,
      choices: finalChoices,
      answerSingle: null,
      answerMulti,
      answerText: '',
      hint
    }
  }
  const answerSingle = parseChoiceIndex(result.answer, finalChoices)
  if (answerSingle === null) return null
  return {
    id: createId(),
    type,
    content,
    choices: finalChoices,
    answerSingle,
    answerMulti: [],
    answerText: '',
    hint
  }
}

async function readRowsFromFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    const text = await file.text()
    return parseCsv(text)
  }
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[][]
  return rows
}

function triggerImport() {
  importInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importError.value = ''
  importStats.value = { total: 0, parsed: 0, skipped: 0 }
  importFile.value = input.files?.[0] ?? null
}

async function handleParseImport() {
  if (!importFile.value) {
    importError.value = '请先选择题库题目文件。'
    toast.add({
      severity: 'warn',
      summary: '无法解析',
      detail: '请先选择题库题目文件',
      life: 3000
    })
    return
  }
  importError.value = ''
  importParsing.value = true
  try {
    const rows = (await readRowsFromFile(importFile.value))
      .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : cell)))
      .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    if (!rows.length) {
      importError.value = '文件中没有可用数据。'
      toast.add({
        severity: 'warn',
        summary: '解析失败',
        detail: '文件中没有可用数据',
        life: 3000
      })
      return
    }
    const headers = useHeaderRow.value ? rows[0].map((cell) => String(cell ?? '').trim()) : []
    const dataRows = useHeaderRow.value ? rows.slice(1) : rows
    if (!dataRows.length) {
      importError.value = '表格中没有可解析的数据行。'
      toast.add({
        severity: 'warn',
        summary: '解析失败',
        detail: '表格中没有可解析的数据行',
        life: 3000
      })
      return
    }
    const parser = new Function('row', 'meta', parserCode.value) as (
      row: any,
      meta: { index: number; headers: string[]; raw: any[] }
    ) => any
    const parsed: ProblemDraft[] = []
    let skipped = 0
    dataRows.forEach((row, index) => {
      const rowObject: Record<string, any> = {}
      if (headers.length) {
        headers.forEach((header, headerIndex) => {
          if (!header) return
          rowObject[header] = row[headerIndex]
        })
      }
      const rowValue = headers.length ? rowObject : row
      const result = parser(rowValue, { index: index + 1, headers, raw: row })
      const problem = createProblemDraftFromResult(result)
      if (problem) {
        parsed.push(problem)
      } else {
        skipped += 1
      }
    })
    importStats.value = { total: dataRows.length, parsed: parsed.length, skipped }
    if (!parsed.length) {
      importError.value = '未解析出有效题目，请检查解析函数或文件内容。'
      toast.add({
        severity: 'warn',
        summary: '解析失败',
        detail: '未解析出有效题目，请检查解析函数或文件内容',
        life: 3500
      })
      return
    }
    if (problems.value.length) {
      const confirmed = window.confirm('解析结果将覆盖当前已编辑的题目，是否继续？')
      if (!confirmed) return
    }
    problems.value = parsed
    selectedProblemId.value = parsed[0]?.id ?? null
    activeEditorTab.value = 'manual'
    toast.add({
      severity: 'success',
      summary: '解析完成',
      detail: `共 ${importStats.value.total} 行 · 解析 ${parsed.length} 行 · 跳过 ${importStats.value.skipped} 行`,
      life: 3500
    })
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '解析失败，请检查文件或解析函数。'
    toast.add({
      severity: 'error',
      summary: '解析失败',
      detail: importError.value,
      life: 3500
    })
  } finally {
    importParsing.value = false
  }
}

const stats = computed(() => {
  const counts = [0, 0, 0, 0, 0]
  for (const problem of problems.value) {
    if (problem.type >= 0 && problem.type <= 4) {
      counts[problem.type] += 1
    }
  }
  return counts
})

const isFormValid = computed(() => {
  if (!title.value.trim()) return false
  if (!problems.value.length) return false
  return problems.value.every((problem) => Boolean(buildProblemPayload(problem)))
})

async function handleSubmit() {
  if (!userStore.user) {
    router.push({ name: 'login' })
    return
  }
  submitError.value = ''
  submitLoading.value = true
  try {
    const problemPayload = problems.value
      .map(buildProblemPayload)
      .filter((item): item is ProblemPayload => Boolean(item))
    if (!problemPayload.length) {
      submitError.value = '请至少完善一道题目。'
      return
    }
    const counts = [0, 0, 0, 0, 0]
    for (const item of problemPayload) {
      if (item.type >= 0 && item.type <= 4) {
        counts[item.type] += 1
      }
    }
    const payload = {
      title: title.value.trim(),
      year: year.value,
      categories: categoriesText.value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      isPublic: canManage.value ? isPublic.value : false,
      inviteCode: isPublic.value ? null : inviteCode.value.trim() || null,
      problems: problemPayload,
      test: counts,
      score: [0, 1, 2, 1, 1]
    }
    const response = await fetch(`${apiBase}/api/problem-sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`创建失败: ${response.status}`)
    }
    router.push({ name: 'admin-question-banks' })
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '创建失败'
  } finally {
    submitLoading.value = false
  }
}

if (!problems.value.length) {
  addProblem(1)
}

const selectedProblem = computed(() =>
  problems.value.find((item) => item.id === selectedProblemId.value) ?? null
)

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tag)) return true
  if (target.isContentEditable) return true
  if (target.closest('.p-dropdown, .p-multiselect, .p-inputnumber')) return true
  return false
}

function handleArrowNavigate(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  if (isInteractiveTarget(event.target)) return
  if (!problems.value.length) return
  event.preventDefault()
  const currentIndex = problems.value.findIndex((item) => item.id === selectedProblemId.value)
  const safeIndex = currentIndex === -1 ? 0 : currentIndex
  const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
  const nextIndex = Math.min(Math.max(0, safeIndex + delta), problems.value.length - 1)
  selectedProblemId.value = problems.value[nextIndex].id
}

onMounted(() => {
  window.addEventListener('keydown', handleArrowNavigate)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleArrowNavigate)
})
</script>

<template>
  <section class="page">
    <form class="page-form" @submit.prevent="handleSubmit">
      <header class="page-head">
        <div>
          <div class="eyebrow">题库管理</div>
          <h1>新建题库</h1>
          <p>管理后台创建题库并录入题目。</p>
        </div>
        <div class="page-actions">
          <Button label="返回列表" severity="secondary" text size="small" @click="router.push({ name: 'admin-question-banks' })" />
        </div>
      </header>

      <section class="vtix-panel">
        <div class="vtix-panel__title">题库信息</div>
        <div class="vtix-panel__content">
          <div class="info-grid">
            <label class="field">
              <span>题库名称</span>
              <InputText v-model="title" placeholder="例如：2025 思政自测" />
            </label>
            <label class="field">
              <span>年份</span>
              <InputNumber v-model="year" :useGrouping="false" />
            </label>
            <label class="field">
              <span>分类（逗号分隔）</span>
              <InputText v-model="categoriesText" placeholder="例如：政治,考试" />
            </label>
            <label v-if="canManage" class="field">
              <span>公开题库</span>
              <div class="toggle-row">
                <Checkbox v-model="isPublic" :binary="true" />
                <span class="toggle-label">{{ isPublic ? '公开' : '非公开' }}</span>
              </div>
            </label>
            <label v-if="!isPublic" class="field">
              <span>邀请码（可选）</span>
              <InputText v-model="inviteCode" placeholder="留空则无法通过邀请码访问" />
            </label>
          </div>
          <div class="info-stats">
            <Tag severity="info" rounded>总题数 {{ problems.length }}</Tag>
            <Tag severity="secondary" rounded>单选 {{ stats[1] }}</Tag>
            <Tag severity="secondary" rounded>多选 {{ stats[2] }}</Tag>
            <Tag severity="secondary" rounded>填空 {{ stats[3] }}</Tag>
            <Tag severity="secondary" rounded>判断 {{ stats[4] }}</Tag>
          </div>
        </div>
      </section>

      <TabMenu class="editor-tabs" :model="editorTabItems" :activeIndex="activeEditorTabIndex" />

      <div v-if="activeEditorTab === 'manual'" class="problem-layout">
        <section class="problem-editor-card vtix-panel">
          <div class="vtix-panel__title">
            <span>题目编辑</span>
            <Button label="添加题目" size="small" @click="addProblem(1)" />
          </div>
          <div class="vtix-panel__content">
            <div v-if="!selectedProblem" class="empty">请选择右侧题号开始编辑</div>
            <div v-else class="problem-card">
              <div class="problem-head">
                <div class="problem-index">
                  题目 {{ problems.findIndex((item) => item.id === selectedProblem.id) + 1 }}
                </div>
                <div class="problem-controls">
                  <Dropdown
                    v-model="selectedProblem.type"
                    :options="typeOptions"
                    optionLabel="label"
                    optionValue="value"
                    class="type-select"
                    @change="updateType(selectedProblem, selectedProblem.type)"
                  />
                  <Button
                    label="删除"
                    severity="danger"
                    text
                    size="small"
                    @click="removeProblem(problems.findIndex((item) => item.id === selectedProblem.id))"
                  />
                </div>
              </div>

              <label class="field choice-content-field">
                <span>题目内容</span>
                <Textarea v-model="selectedProblem.content" rows="3" autoResize placeholder="请输入题干" />
              </label>

              <div v-if="selectedProblem.type !== 3" class="choice-block">
                <div class="choice-title">选项</div>
                <div class="choice-list">
                  <div
                    v-for="(choice, cIndex) in selectedProblem.choices"
                    :key="`${selectedProblem.id}-choice-${cIndex}`"
                    class="choice-item"
                  >
                    <InputText v-model="selectedProblem.choices[cIndex]" placeholder="选项内容" />
                    <div class="choice-answer">
                      <RadioButton
                        v-if="selectedProblem.type === 1 || selectedProblem.type === 4"
                        :name="`${selectedProblem.id}-answer`"
                        :value="cIndex"
                        v-model="selectedProblem.answerSingle"
                      />
                      <Checkbox
                        v-else
                        :binary="true"
                        :modelValue="selectedProblem.answerMulti.includes(cIndex)"
                        @update:modelValue="toggleMultiAnswer(selectedProblem, cIndex)"
                      />
                      <span>正确</span>
                    </div>
                    <Button
                      v-if="selectedProblem.type !== 4"
                      label="删除选项"
                      severity="secondary"
                      text
                      size="small"
                      @click="removeChoice(selectedProblem, cIndex)"
                    />
                  </div>
                </div>
                <div v-if="selectedProblem.type !== 4" class="choice-actions">
                  <Button label="添加选项" size="small" severity="secondary" text @click="addChoice(selectedProblem)" />
                </div>
              </div>

              <label v-else class="field">
                <span>参考答案</span>
                <InputText v-model="selectedProblem.answerText" placeholder="填空答案，多个答案用逗号分隔" />
              </label>

              <label class="field">
                <span>解析（可选）</span>
                <InputText v-model="selectedProblem.hint" placeholder="可填写提示或解析" />
              </label>
            </div>
          </div>
        </section>

        <section class="problem-indexes-card vtix-panel vtix-list-panel">
          <div class="vtix-panel__title">题号</div>
          <div class="vtix-panel__content">
            <div class="vtix-number-grid">
              <button
                v-for="(problem, index) in problems"
                :key="problem.id"
                type="button"
                :class="['vtix-number-btn', { active: problem.id === selectedProblemId }]"
                @click="selectedProblemId = problem.id"
              >
                {{ index + 1 }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section v-else class="vtix-panel import-panel">
        <div class="vtix-panel__title">上传文件并解析</div>
        <div class="vtix-panel__content import-content">
          <div class="import-row">
            <Button label="选择文件" severity="secondary" text size="small" @click="triggerImport" />
            <span class="import-file">{{ importFile?.name || '未选择文件' }}</span>
            <input
              ref="importInput"
              type="file"
              class="import-file-input"
              accept=".xlsx,.xls,.csv"
              @change="handleFileChange"
            />
          </div>
          <label class="import-toggle">
            <Checkbox v-model="useHeaderRow" :binary="true" />
            <span>首行作为表头（可通过列名取值）</span>
          </label>
          <div class="import-tip">
            函数返回格式示例：{ title, type, choices, answer, hint }。<br>
            title：题目的题干。<br>
            type：1 单选、2 多选、3 填空、4 判断。<br>
            choices：选项数组，多选和单选均适用，填空题可不传。<br>
            answer：单选/判断为数字下标（0 表示 A，1 表示 B，以此类推），多选为下标数组，填空为字符串。<br>
            hint：题目解析。<br>
          </div>
          <label class="field">
            <span>解析函数</span>
            <Textarea v-model="parserCode" rows="10" autoResize />
          </label>
          <div class="import-actions">
            <Button
              label="解析并覆盖题目"
              :loading="importParsing"
              severity="primary"
              size="small"
              @click="handleParseImport"
            />
            <div class="import-stats" v-if="importStats.total">
              共 {{ importStats.total }} 行 · 解析 {{ importStats.parsed }} 行 · 跳过 {{ importStats.skipped }} 行
            </div>
          </div>
          <div v-if="importError" class="import-error">{{ importError }}</div>
        </div>
      </section>

      <div v-if="submitError" class="error">{{ submitError }}</div>

      <div class="footer-actions">
        <Button label="保存题库" :loading="submitLoading" :disabled="!isFormValid" @click="handleSubmit" />
      </div>
    </form>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.page-form {
  display: flex;
  flex-direction: column;
  gap: 28px;
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

.editor-tabs :deep(.p-tabmenu-nav) {
  border: none;
  background: transparent;
  gap: 10px;
}

.editor-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: #6b7280;
  font-weight: 700;
  padding: 8px 14px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.editor-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: #f1f3f6;
  color: #0f172a;
  border-color: #e5e7eb;
}

.editor-tabs :deep(.p-tabmenuitem-link:hover) {
  background: #f8fafc;
  color: #0f172a;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.field :deep(.p-inputtext) {
  width: 100%;
}

.field :deep(.p-inputnumber) {
  width: 100%;
}

.field :deep(.p-inputtextarea) {
  width: 100%;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.toggle-label {
  font-weight: 600;
  color: #0f172a;
}

.info-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
}

.problem-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.import-panel {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.import-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.import-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #475569;
}

.import-file {
  color: #0f172a;
  font-weight: 600;
}

.import-file-input {
  display: none;
}

.import-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.import-tip {
  font-size: 12px;
  color: #64748b;
}

.import-panel :deep(.p-textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.import-stats {
  font-size: 12px;
  color: #64748b;
}

.import-error {
  color: #b91c1c;
  font-size: 13px;
}

.problem-indexes-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.problem-indexes-card .vtix-panel__content {
  flex: 1;
  overflow: auto;
  padding: 6px;
}

.problem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e2e8f0;
}

.problem-index {
  font-weight: 700;
  color: #0f172a;
}

.problem-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.type-select :deep(.p-dropdown) {
  min-width: 140px;
}

label.field.choice-content-field {
  margin-top: 12px;
}

.problem-card .field {
  margin-top: 16px;
}

.choice-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.choice-title {
  font-weight: 700;
  color: #0f172a;
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choice-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.choice-answer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #475569;
}

.choice-actions {
  display: flex;
  justify-content: flex-end;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.error {
  color: #b91c1c;
  font-size: 13px;
}

.problem-editor-card {
  background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .problem-layout {
    grid-template-columns: 1fr;
  }

  .vtix-list-panel :deep(.vtix-panel__content) {
    max-height: none;
  }

  .choice-item {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }
}
</style>
