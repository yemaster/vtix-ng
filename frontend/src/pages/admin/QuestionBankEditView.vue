<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import RadioButton from 'primevue/radiobutton'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import type { ProblemType } from '../../base/ProblemTypes'

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
type TestConfigItem = {
  type: number
  number: number
  score: number
}

type ProblemSetDetail = {
  title: string
  year: number
  categories: string[]
  isPublic: boolean
  inviteCode: string | null
  test?: unknown
  score?: unknown
  problems: ProblemType[]
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const toast = useToast()

const title = ref('')
const year = ref(new Date().getFullYear())
const categoriesText = ref('')
const inviteCode = ref('')

const problems = ref<ProblemDraft[]>([])
const selectedProblemId = ref<string | null>(null)
const loadError = ref('')
const loadLoading = ref(true)
const submitLoading = ref(false)

const editorTabs = [
  { label: '可视化编辑', value: 'manual' },
  { label: '代码编辑', value: 'json' }
]
const activeEditorTab = ref<'manual' | 'json'>('manual')
const editorTabItems = editorTabs.map((tab) => ({
  label: tab.label,
  command: () => {
    setActiveEditorTab(tab.value as 'manual' | 'json')
  }
}))
const activeEditorTabIndex = computed(
  () => editorTabs.findIndex((item) => item.value === activeEditorTab.value)
)

const jsonText = ref(`[
  {
    "type": 1,
    "content": "题干示例",
    "choices": ["选项A", "选项B", "选项C", "选项D"],
    "answer": 0,
    "hint": "解析"
  }
]`)
const jsonError = ref('')
const jsonParsing = ref(false)
const jsonStats = ref({ total: 0, parsed: 0, skipped: 0 })


const typeOptions = [
  { label: '单选题', value: 1 },
  { label: '多选题', value: 2 },
  { label: '填空题', value: 3 },
  { label: '判断题', value: 4 }
]
const testTypeOptions = [
  { label: '送分题', value: 0 },
  { label: '单选题', value: 1 },
  { label: '多选题', value: 2 },
  { label: '填空题', value: 3 },
  { label: '判断题', value: 4 }
]
const DEFAULT_TEST_SCORES = [0, 1, 2, 1, 1]
const testConfig = ref<TestConfigItem[]>([])

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
  const removedItem = removed[0]
  if (!removedItem) return
  if (selectedProblemId.value === removedItem.id) {
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
    const pair: [string, string] = [choices[0]!, choices[1]!]
    return hint ? { type: 4, content, choices: pair, answer, hint } : { type: 4, content, choices: pair, answer }
  }
  return hint ? { type: 1, content, choices, answer, hint } : { type: 1, content, choices, answer }
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
  const letter = text.charAt(0)
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

function buildDefaultTestConfig(counts: number[]) {
  return [1, 2, 3, 4].map((type) => ({
    type,
    number: Math.max(0, Math.floor(Number(counts[type] ?? 0))),
    score: DEFAULT_TEST_SCORES[type] ?? 0
  }))
}

function normalizeTestConfig(list: TestConfigItem[], fallbackCounts: number[]) {
  const order: number[] = []
  const map = new Map<number, TestConfigItem>()
  for (const item of list) {
    const type = Math.floor(Number(item.type))
    if (!Number.isFinite(type) || type < 0 || type > 4) continue
    const number = Math.max(0, Math.floor(Number(item.number ?? 0)))
    if (number <= 0) continue
    const score = Math.max(0, Number(item.score ?? 0))
    if (!map.has(type)) {
      order.push(type)
      map.set(type, { type, number, score })
    } else {
      const existing = map.get(type)
      if (existing) {
        existing.number += number
        existing.score = score
      }
    }
  }
  if (!order.length) {
    return buildDefaultTestConfig(fallbackCounts)
  }
  return order.map((type) => map.get(type) as TestConfigItem)
}

function resolveTestConfig(rawTest: unknown, rawScore: unknown, fallbackCounts: number[]) {
  if (Array.isArray(rawTest)) {
    if (rawTest.every((item) => item && typeof item === 'object')) {
      return normalizeTestConfig(rawTest as TestConfigItem[], fallbackCounts)
    }
    if (rawTest.every((item) => typeof item === 'number')) {
      const scores = Array.isArray(rawScore) ? rawScore : DEFAULT_TEST_SCORES
      const list = rawTest.map((count, type) => ({
        type,
        number: Math.max(0, Math.floor(Number(count ?? 0))),
        score: Math.max(0, Number(scores[type] ?? 0))
      }))
      return normalizeTestConfig(list, fallbackCounts)
    }
  }
  return buildDefaultTestConfig(fallbackCounts)
}

function addTestConfigRow() {
  const used = new Set(testConfig.value.map((item) => item.type))
  const nextType =
    testTypeOptions.map((option) => option.value).find((value) => !used.has(value)) ?? 1
  testConfig.value.push({
    type: nextType,
    number: 0,
    score: DEFAULT_TEST_SCORES[nextType] ?? 0
  })
}

function removeTestConfigRow(index: number) {
  testConfig.value.splice(index, 1)
}

function buildJsonItem(problem: ProblemDraft) {
  const item: Record<string, unknown> = {
    type: problem.type,
    content: problem.content
  }
  if (problem.type === 3) {
    item.answer = problem.answerText
  } else {
    item.choices = problem.choices
    item.answer = problem.type === 2 ? problem.answerMulti : problem.answerSingle
  }
  if (problem.hint) {
    item.hint = problem.hint
  }
  return item
}

function syncJsonFromProblems() {
  const items = new Array(problems.value.length)
  for (let i = 0; i < problems.value.length; i += 1) {
    const problem = problems.value[i]
    if (!problem) continue
    items[i] = buildJsonItem(problem)
  }
  const indent = items.length > 2000 ? 0 : 2
  jsonText.value = JSON.stringify(items, null, indent)
  jsonError.value = ''
  jsonStats.value = { total: 0, parsed: 0, skipped: 0 }
}

function setActiveEditorTab(next: 'manual' | 'json') {
  if (next === activeEditorTab.value) return
  activeEditorTab.value = next
  if (next === 'json') {
    syncJsonFromProblems()
  }
}

function extractJsonItems(raw: unknown) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const record = raw as { problems?: unknown }
    if (Array.isArray(record.problems)) return record.problems
    return [raw]
  }
  return []
}

async function handleParseJson() {
  jsonError.value = ''
  jsonStats.value = { total: 0, parsed: 0, skipped: 0 }
  const text = jsonText.value.trim()
  if (!text) {
    jsonError.value = '请先输入 JSON 内容。'
    toast.add({
      severity: 'warn',
      summary: '无法解析',
      detail: jsonError.value,
      life: 3000
    })
    return
  }
  jsonParsing.value = true
  try {
    const raw = JSON.parse(text)
    const items = extractJsonItems(raw)
    const parsed: ProblemDraft[] = []
    let skipped = 0
    items.forEach((item) => {
      const problem = createProblemDraftFromResult(item)
      if (problem) {
        parsed.push(problem)
      } else {
        skipped += 1
      }
    })
    jsonStats.value = { total: items.length, parsed: parsed.length, skipped }
    if (!parsed.length) {
      jsonError.value = '未解析出有效题目，请检查 JSON 格式。'
      toast.add({
        severity: 'warn',
        summary: '解析失败',
        detail: jsonError.value,
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
      detail: `共 ${jsonStats.value.total} 条 · 解析 ${parsed.length} 条 · 跳过 ${jsonStats.value.skipped} 条`,
      life: 3500
    })
  } catch (error) {
    jsonError.value = error instanceof Error ? error.message : '解析失败，请检查 JSON。'
    toast.add({
      severity: 'error',
      summary: '解析失败',
      detail: jsonError.value,
      life: 3500
    })
  } finally {
    jsonParsing.value = false
  }
}

function ensureChoices(type: number, raw: unknown) {
  const choices = Array.isArray(raw) ? raw.map((item) => String(item)) : []
  if (type === 4) {
    return choices.length >= 2 ? [choices[0]!, choices[1]!] : ['正确', '错误']
  }
  if (!choices.length) {
    return ['', '', '', '']
  }
  if (choices.length < 2) {
    return [...choices, '']
  }
  return choices
}

function toDraft(problem: ProblemType): ProblemDraft {
  const base: ProblemDraft = {
    id: createId(),
    type: problem.type,
    content: problem.content ?? '',
    choices: [],
    answerSingle: null,
    answerMulti: [],
    answerText: '',
    hint: problem.hint ?? ''
  }
  if (problem.type === 3) {
    base.answerText = String(problem.answer ?? '')
    base.choices = []
    return base
  }
  base.choices = ensureChoices(problem.type, problem.choices)
  if (problem.type === 2) {
    const answer = Array.isArray(problem.answer) ? problem.answer : []
    base.answerMulti = answer.filter((value) => Number.isFinite(value))
    return base
  }
  const answer = typeof problem.answer === 'number' ? problem.answer : null
  if (answer !== null && answer >= 0 && answer < base.choices.length) {
    base.answerSingle = answer
  }
  return base
}

const stats = computed(() => {
  const counts = [0, 0, 0, 0, 0]
  for (const problem of problems.value) {
    const index = problem.type
    if (index >= 0 && index < counts.length) {
      counts[index] = (counts[index] ?? 0) + 1
    }
  }
  return counts
})

const isFormValid = computed(() => {
  if (!title.value.trim()) return false
  if (!problems.value.length) return false
  return problems.value.every((problem) => Boolean(buildProblemPayload(problem)))
})

async function loadDetail() {
  loadError.value = ''
  loadLoading.value = true
  try {
    const code = String(route.params.code ?? '')
    if (!code) {
      loadError.value = '题库编号缺失'
      return
    }
    const response = await fetch(`${apiBase}/api/problem-sets/${code}`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      router.push({ name: 'login' })
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as ProblemSetDetail
    title.value = data.title ?? ''
    year.value = Number.isFinite(data.year) ? data.year : new Date().getFullYear()
    categoriesText.value = Array.isArray(data.categories) ? data.categories.join(',') : ''
    inviteCode.value = data.inviteCode ?? ''
    problems.value = Array.isArray(data.problems) ? data.problems.map(toDraft) : []
    if (!problems.value.length) {
      addProblem(1)
    } else {
      selectedProblemId.value = problems.value[0]?.id ?? null
    }
    testConfig.value = resolveTestConfig(data.test, data.score, stats.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loadLoading.value = false
  }
}

async function handleSubmit() {
  if (!userStore.user) {
    router.push({ name: 'login' })
    return
  }
  submitLoading.value = true
  try {
    const code = String(route.params.code ?? '')
    if (!code) {
      throw new Error('题库编号缺失')
    }
    const problemPayload = problems.value
      .map(buildProblemPayload)
      .filter((item): item is ProblemPayload => Boolean(item))
    if (!problemPayload.length) {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请至少完善一道题目。',
        life: 3000
      })
      return
    }
    const counts = [0, 0, 0, 0, 0]
    for (const item of problemPayload) {
      const index = item.type
      if (index >= 0 && index < counts.length) {
        counts[index] = (counts[index] ?? 0) + 1
      }
    }
    const testMeta = normalizeTestConfig(testConfig.value, counts)
    const payload = {
      title: title.value.trim(),
      year: year.value,
      categories: categoriesText.value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      inviteCode: inviteCode.value.trim() || null,
      problems: problemPayload,
      test: testMeta
    }
    const response = await fetch(`${apiBase}/api/problem-sets/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`)
    }
    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '题库已更新',
      life: 3000
    })
    router.push({ name: 'admin-question-banks' })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存失败',
      life: 3500
    })
  } finally {
    submitLoading.value = false
  }
}

const selectedProblem = computed(() =>
  problems.value.find((item) => item.id === selectedProblemId.value) ?? null
)

onMounted(() => {
  void loadDetail()
})

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tag)) return true
  if (target.isContentEditable) return true
  if (target.closest('.p-select, .p-multiselect, .p-inputnumber')) return true
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
  const nextProblem = problems.value[nextIndex]
  if (nextProblem) {
    selectedProblemId.value = nextProblem.id
  }
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
          <h1>编辑题库</h1>
          <p>调整题库信息与题目内容。</p>
        </div>
        <div class="page-actions">
          <Button label="返回列表" severity="secondary" text size="small"
            @click="router.push({ name: 'admin-question-banks' })" />
        </div>
      </header>

      <div v-if="loadError" class="status">
        <div class="status-title">加载失败</div>
        <div class="status-detail">{{ loadError }}</div>
      </div>

      <div v-else-if="loadLoading" class="loading">正在加载题库...</div>

      <template v-else>
        <div class="section-heading">
          <div class="section-badge">1</div>
          <div>
            <div class="section-title">题库信息</div>
          </div>
        </div>
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
              <label class="field">
                <span>邀请码</span>
                <InputText v-model="inviteCode" placeholder="邀请码（私有题库访问）" />
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

        <div class="section-heading">
          <div class="section-badge">2</div>
          <div>
            <div class="section-title">模拟考试配置</div>
          </div>
        </div>
        <section class="vtix-panel test-config-panel">
          <div class="vtix-panel__title">
            <span>模拟考试配置</span>
            <div class="panel-actions">
              <Button label="添加配置" severity="secondary" text size="small" @click="addTestConfigRow" />
            </div>
          </div>
          <div class="vtix-panel__content">
            <div v-if="!testConfig.length" class="empty">暂无配置，请点击右上角添加。</div>
            <div v-else class="test-config-list">
              <div v-for="(item, index) in testConfig" :key="`test-config-${index}`" class="test-config-row">
                <div class="test-config-field">
                  <span>题目类型</span>
                  <Select v-model="item.type" size="small" :options="testTypeOptions" optionLabel="label" optionValue="value"
                    class="test-type-select" />
                </div>
                <div class="test-config-field">
                  <span>题数</span>
                  <InputNumber v-model="item.number" size="small" :min="0" :useGrouping="false" />
                </div>
                <div class="test-config-field">
                  <span>每题分数</span>
                  <InputNumber v-model="item.score" size="small" :min="0" :useGrouping="false" />
                </div>
                <Button label="删除" severity="secondary" text size="small" @click="removeTestConfigRow(index)" />
              </div>
            </div>
          </div>
        </section>

        <div class="section-heading">
          <div class="section-badge">3</div>
          <div>
            <div class="section-title">题目编辑</div>
          </div>
        </div>
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
                    题目 {{problems.findIndex((item) => item.id === selectedProblem!.id) + 1}}
                  </div>
                  <div class="problem-controls">
                    <Select v-model="selectedProblem!.type" :options="typeOptions" optionLabel="label"
                      optionValue="value" class="type-select"
                      @change="updateType(selectedProblem!, selectedProblem!.type)" />
                    <Button label="删除" severity="danger" text size="small"
                      @click="removeProblem(problems.findIndex((item) => item.id === selectedProblem!.id))" />
                  </div>
                </div>

                <label class="field choice-content-field">
                  <span>题目内容</span>
                  <Textarea v-model="selectedProblem!.content" rows="3" autoResize placeholder="请输入题干" />
                </label>

                <div v-if="selectedProblem!.type !== 3" class="choice-block">
                  <div class="choice-title">选项</div>
                  <div class="choice-list">
                    <div v-for="(choice, cIndex) in selectedProblem!.choices"
                      :key="`${selectedProblem!.id}-choice-${cIndex}`" class="choice-item">
                      <InputText v-model="selectedProblem!.choices[cIndex]" placeholder="选项内容" :data-choice="choice" />
                      <div class="choice-answer">
                        <RadioButton v-if="selectedProblem!.type === 1 || selectedProblem!.type === 4"
                          :name="`${selectedProblem!.id}-answer`" :value="cIndex"
                          v-model="selectedProblem!.answerSingle" />
                        <Checkbox v-else :binary="true" :modelValue="selectedProblem!.answerMulti.includes(cIndex)"
                          @update:modelValue="toggleMultiAnswer(selectedProblem!, cIndex)" />
                        <span>正确</span>
                      </div>
                      <Button v-if="selectedProblem!.type !== 4" label="删除选项" severity="secondary" text size="small"
                        @click="removeChoice(selectedProblem!, cIndex)" />
                    </div>
                  </div>
                  <div v-if="selectedProblem!.type !== 4" class="choice-actions">
                    <Button label="添加选项" size="small" severity="secondary" text @click="addChoice(selectedProblem!)" />
                  </div>
                </div>

                <label v-else class="field">
                  <span>参考答案</span>
                  <InputText v-model="selectedProblem!.answerText" placeholder="填空答案，多个答案用逗号分隔" />
                </label>

                <label class="field">
                  <span>解析（可选）</span>
                  <InputText v-model="selectedProblem!.hint" placeholder="可填写提示或解析" />
                </label>
              </div>
            </div>
          </section>

          <section class="problem-indexes-card vtix-panel vtix-list-panel">
            <div class="vtix-panel__title">题号</div>
            <div class="vtix-panel__content">
              <div class="vtix-number-grid">
                <button v-for="(problem, index) in problems" :key="problem.id" type="button"
                  :class="['vtix-number-btn', { active: problem.id === selectedProblemId }]"
                  @click="selectedProblemId = problem.id">
                  {{ index + 1 }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <section v-else class="vtix-panel json-panel">
          <div class="vtix-panel__title">JSON 编辑</div>
          <div class="vtix-panel__content json-content">
            <div class="json-tip">
              支持格式：题目数组。<br>
              题目格式：{ title, type, choices, answer, hint }。<br>
              title：题目的题干。<br>
              type：1 单选、2 多选、3 填空、4 判断。<br>
              choices：选项数组，多选和单选均适用，填空题可不传。<br>
              answer：单选/判断为数字下标（0 表示 A，1 表示 B，以此类推），多选为下标数组，填空为字符串。<br>
              hint：题目解析。
            </div>
            <label class="field">
              <span>JSON 内容</span>
              <Textarea v-model="jsonText" rows="12" autoResize />
            </label>
            <div class="json-actions">
              <Button label="解析并覆盖题目" :loading="jsonParsing" severity="primary" size="small" @click="handleParseJson" />
              <div class="json-stats" v-if="jsonStats.total">
                共 {{ jsonStats.total }} 条 · 解析 {{ jsonStats.parsed }} 条 · 跳过 {{ jsonStats.skipped }} 条
              </div>
            </div>
            <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
          </div>
        </section>

        <div class="footer-actions">
          <Button label="保存修改" :loading="submitLoading" :disabled="!isFormValid" @click="handleSubmit" />
        </div>
      </template>
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

.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-badge {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  display: grid;
  place-items: center;
}

.section-title {
  font-weight: 800;
  color: #0f172a;
}

.section-desc {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.field :deep(.p-textarea) {
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

.test-config-panel {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.test-config-panel :deep(.vtix-panel__content) {
  padding: 16px;
}

.test-config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.test-config-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) repeat(2, minmax(120px, 1fr)) auto;
  gap: 10px;
  align-items: center;
}

.test-config-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.test-type-select :deep(.p-select),
.test-type-select :deep(.p-dropdown) {
  width: 100%;
}

.test-config-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}

.editor-tip {
  font-size: 12px;
  color: #64748b;
  margin-top: -8px;
}

.problem-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.json-panel {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.json-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.json-tip {
  font-size: 12px;
  color: #64748b;
}

.json-template {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  white-space: pre-wrap;
}

.json-panel :deep(.p-textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  max-height: 360px;
  overflow: auto;
}

.json-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.json-stats {
  font-size: 12px;
  color: #64748b;
}

.json-error {
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

.type-select :deep(.p-select),
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
  justify-content: flex-start;
  margin-top: 8px;
  position: sticky;
  bottom: 0;
  padding: 12px 16px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, #ffffff 40%);
  border-top: 1px dashed #e2e8f0;
  backdrop-filter: blur(6px);
}

.problem-editor-card {
  background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
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

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.loading {
  border: 1px dashed #e5e7eb;
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .problem-layout {
    grid-template-columns: 1fr;
  }

  .test-config-row {
    grid-template-columns: 1fr;
    align-items: stretch;
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
