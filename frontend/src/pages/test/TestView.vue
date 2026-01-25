<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ChooseProblemType, ProblemType } from '../../base/ProblemTypes'
import { deepCopy } from '../../base/funcs'
import { parseProgress } from '../../base/progressParser'

type ProblemListType = {
  title: string
  test: [number, number, number, number, number] | number
  score: [number, number, number, number, number]
  problems: ProblemType[]
}

const router = useRouter()
const route = useRoute()
const testId = String(route.params.id || '')
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const loading = ref(true)
const loadError = ref('')

const problemInfo = ref<ProblemListType>({
  title: '加载中',
  test: [0, 0, 0, 0, 0],
  score: [0, 0, 0, 0, 0],
  problems: []
})

const testTitle = computed(() => problemInfo.value.title || '测试题库')

const viewMode = ref<'menu' | 'question' | 'list'>('question')
const isMobile = ref(false)
let mediaQuery: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null

const modes = [
  { label: '顺序练习', value: 0 },
  { label: '乱序练习', value: 1 },
  { label: '自定义练习', value: 2 },
  { label: '错题回顾', value: 4 },
  { label: '模拟考试', value: 5 }
]

const practiceMode = ref(0)
const problemTypes = ['送分题', '单选题', '多选题', '填空题', '判断题']
const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']

const nowProblemList = ref<ProblemType[]>([])
const nowProblemId = ref(0)
const answerList = ref<(number | string)[][]>([])
const nowAnswer = ref<(number | string)[]>([])
const writeAnswer = ref('')
const problemState = ref<number[]>([])
const errorProblems = ref<ProblemType[]>([])

const currentProblem = computed(() => nowProblemList.value[nowProblemId.value])
const currentTypeLabel = computed(() => {
  const type = currentProblem.value?.type ?? 0
  return problemTypes[type] ?? '题目'
})

const isSubmitted = computed(() => problemState.value[nowProblemId.value] >= 2)

const setType = ref<[boolean, boolean, boolean, boolean, boolean]>([true, true, true, true, true])
const setShuffle = ref(false)

function setTitle(title: string) {
  document.title = title
}

function shuffleList(list: ProblemType[]) {
  const copy = deepCopy(list)
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function initData(problemList: ProblemType[]) {
  nowProblemList.value = problemList
  nowProblemId.value = 0
  answerList.value = problemList.map(() => [])
  nowAnswer.value = []
  writeAnswer.value = ''
  problemState.value = Array(problemList.length).fill(0)
}

function normalizeFill(value: string) {
  return value.replace(/，/g, ',').trim()
}

function getCorrectIndices(problem: ProblemType | undefined) {
  if (!problem) return []
  if (problem.type === 1 || problem.type === 4) {
    return [problem.answer]
  }
  if (problem.type === 2) {
    return problem.answer
  }
  return []
}

function getChoiceClass(index: number) {
  const correctIndices = getCorrectIndices(currentProblem.value)
  const selected = nowAnswer.value.includes(index)
  if (!isSubmitted.value) {
    return { chosen: selected }
  }
  const correct = correctIndices.includes(index)
  return {
    correct: selected && correct,
    wrong: selected && !correct,
    missed: !selected && correct
  }
}

function setMode(mode: number) {
  practiceMode.value = mode
  if (mode === 0) {
    initData(problemInfo.value.problems)
  } else if (mode === 1) {
    initData(shuffleList(problemInfo.value.problems))
  } else if (mode === 2) {
    const filtered = problemInfo.value.problems.filter((p) => setType.value[p.type])
    initData(setShuffle.value ? shuffleList(filtered) : deepCopy(filtered))
  } else if (mode === 4) {
    initData(deepCopy(errorProblems.value))
  } else if (mode === 5) {
    initData(buildTestList())
  }
  storeData()
}

function buildTestList() {
  const base = problemInfo.value.problems
  const meta = problemInfo.value.test
  if (Array.isArray(meta)) {
    const list: ProblemType[] = []
    for (let i = 0; i < meta.length; i += 1) {
      const count = meta[i]
      if (count <= 0) continue
      const pool = base.filter((p) => p.type === i)
      list.push(...shuffleList(pool).slice(0, count))
    }
    return list.length ? list : shuffleList(base)
  }
  return shuffleList(base).slice(0, Math.min(meta, base.length))
}

function choose(index: number) {
  if (!currentProblem.value) return
  if (isSubmitted.value) return
  if (currentProblem.value.type === 1 || currentProblem.value.type === 4) {
    nowAnswer.value = [index]
    submitAnswer()
    return
  }
  if (nowAnswer.value.includes(index)) {
    nowAnswer.value = nowAnswer.value.filter((item) => item !== index)
  } else {
    nowAnswer.value = [...nowAnswer.value, index]
  }
}

function checkAnswer() {
  if (!currentProblem.value) return
  const problem = currentProblem.value
  let passed = true
  if (problem.type === 1 || problem.type === 4) {
    passed = nowAnswer.value.includes(problem.answer)
  } else if (problem.type === 2) {
    const correctSet = new Set(problem.answer)
    const userSet = new Set(nowAnswer.value as number[])
    if (correctSet.size !== userSet.size) {
      passed = false
    } else {
      for (const answer of correctSet) {
        if (!userSet.has(answer)) {
          passed = false
          break
        }
      }
    }
  } else if (problem.type === 3) {
    const normalized = normalizeFill(writeAnswer.value)
    const userParts = normalized.split(',').map((v) => v.trim())
    const answers = problem.answer.split(',').map((v) => v.trim())
    passed = userParts.length === answers.length
    if (passed) {
      for (let i = 0; i < answers.length; i += 1) {
        const allowed = answers[i].split(';').map((v) => v.trim())
        if (!allowed.includes(userParts[i])) {
          passed = false
          break
        }
      }
    }
    nowAnswer.value = [normalized]
  }
  answerList.value[nowProblemId.value] = [...nowAnswer.value]
  if (passed) {
    problemState.value[nowProblemId.value] = 2
  } else {
    problemState.value[nowProblemId.value] = 3
    errorProblems.value.push(problem)
  }
}

function submitAnswer() {
  if (!currentProblem.value) return
  if (practiceMode.value === 5) {
    if (currentProblem.value.type === 3) {
      nowAnswer.value = [normalizeFill(writeAnswer.value)]
    }
    answerList.value[nowProblemId.value] = [...nowAnswer.value]
    problemState.value[nowProblemId.value] = 1
    if (nowProblemId.value + 1 < nowProblemList.value.length) {
      nowProblemId.value += 1
    }
    storeData()
    return
  }
  checkAnswer()
  if (problemState.value[nowProblemId.value] === 2 && nowProblemId.value + 1 < nowProblemList.value.length) {
    nowProblemId.value += 1
  }
  storeData()
}

function handleModeClick(mode: number) {
  setMode(mode)
}

function storeData() {
  if (!window.localStorage) return
  const payload = {
    practiceMode: practiceMode.value,
    nowProblemId: nowProblemId.value,
    problemList: nowProblemList.value,
    answerList: answerList.value,
    problemState: problemState.value,
    errorProblems: errorProblems.value
  }
  localStorage.setItem(`vtix-progress-${testId}`, JSON.stringify(payload))
}

function loadData() {
  const raw = localStorage.getItem(`vtix-progress-${testId}`)
  if (!raw) return false
  const saved = JSON.parse(raw)
  const parsed = parseProgress(saved)
    ?? (saved?.nowProblemId === 0 ? parseProgress({ ...saved, nowProblemId: 1 }) : undefined)
  if (!parsed) return false
  answerList.value = parsed.answerList
  problemState.value = parsed.problemState
  nowProblemId.value = saved?.nowProblemId ?? parsed.nowProblemId
  nowProblemList.value = parsed.problemList
  nowAnswer.value = answerList.value[nowProblemId.value] ?? []
  if (currentProblem.value?.type === 3) {
    writeAnswer.value = String(nowAnswer.value[0] ?? '')
  }
  practiceMode.value = saved?.practiceMode ?? practiceMode.value
  errorProblems.value = saved?.errorProblems ?? errorProblems.value
  return true
}

async function loadProblem() {
  try {
    const response = await fetch(`${apiBase}/api/problem-sets/${testId}`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as ProblemListType
    problemInfo.value = data
    loading.value = false
    if (loadData()) {
      return
    }
    initData(data.problems)
    setMode(practiceMode.value)
  } catch (error) {
    loading.value = false
    loadError.value = error instanceof Error ? error.message : '加载失败'
    router.push('/notfound')
  }
}

onMounted(() => {
  setTitle(testTitle.value)
  mediaQuery = window.matchMedia('(max-width: 900px)')
  mediaHandler = () => {
    if (mediaQuery) {
      isMobile.value = mediaQuery.matches
    }
  }
  mediaHandler()
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', mediaHandler)
  } else {
    mediaQuery.addListener(mediaHandler)
  }
  void loadProblem()
})

onBeforeUnmount(() => {
  if (mediaQuery && mediaHandler) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaHandler)
    } else {
      mediaQuery.removeListener(mediaHandler)
    }
  }
  storeData()
})

watch(testTitle, (value) => {
  setTitle(value)
})

watch(nowProblemId, () => {
  nowAnswer.value = answerList.value[nowProblemId.value] ?? []
  if (currentProblem.value?.type === 3) {
    writeAnswer.value = String(nowAnswer.value[0] ?? '')
  }
})
</script>

<template>
  <section class="test-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">答题练习</div>
        <h1>{{ testTitle }}</h1>
      </div>
    </header>

    <div class="mode-tabs" v-show="!isMobile || viewMode === 'menu'">
      <button
        v-for="mode in modes"
        :key="mode.value"
        type="button"
        :class="['mode-tab', { active: practiceMode === mode.value }]"
        @click="handleModeClick(mode.value)"
      >
        {{ mode.label }}
      </button>
    </div>

    <div class="main-grid">
      <section class="question-panel" v-show="!isMobile || viewMode === 'question'">
        <div class="question-header">
          <span class="question-type">{{ currentTypeLabel }}</span>
          <span class="question-index">{{ nowProblemList.length ? nowProblemId + 1 : 0 }}/{{ nowProblemList.length }}</span>
        </div>
        <div class="question-content">
          <span class="question-no">{{ nowProblemId + 1 }}.</span>
          {{ currentProblem?.content }}
        </div>
        <div class="question-choices" v-if="currentProblem && currentProblem.type !== 3">
          <button
            v-for="(choice, idx) in (currentProblem as ChooseProblemType).choices"
            :key="choice"
            type="button"
            :class="['choice', getChoiceClass(idx)]"
            @click="choose(idx)"
          >
            {{ choices[idx] }}. {{ choice }}
          </button>
        </div>
        <div class="question-choices" v-else-if="currentProblem && currentProblem.type === 3">
          <input v-model="writeAnswer" class="fill-input" placeholder="请输入答案，多个答案用逗号隔开" />
        </div>
        <div class="question-choices" v-else>
          <span class="placeholder">暂无题目</span>
        </div>
        <div class="submit-row">
          <button type="button" class="ghost-btn" :disabled="nowProblemId === 0" @click="nowProblemId -= 1">
            上一题
          </button>
          <button type="button" class="ghost-btn" :disabled="nowProblemId + 1 >= nowProblemList.length" @click="nowProblemId += 1">
            下一题
          </button>
          <button type="button" class="submit-btn" @click="submitAnswer">提交</button>
        </div>
      </section>

      <aside class="list-panel" v-show="!isMobile || viewMode === 'list'">
        <div class="list-title">题目编号</div>
        <div class="number-grid">
          <button
            v-for="(item, index) in nowProblemList"
            :key="index"
            type="button"
            :class="[
              'number-btn',
              {
                active: index === nowProblemId,
                answered: problemState[index] === 1,
                correct: problemState[index] === 2,
                wrong: problemState[index] === 3
              }
            ]"
            @click="nowProblemId = index"
          >
            {{ index + 1 }}
          </button>
        </div>
      </aside>
    </div>

    <nav class="mobile-menu">
      <a href="javascript:void(0)" :class="['menu-link', { active: viewMode === 'menu' }]" @click.prevent="viewMode = 'menu'">
        菜单
      </a>
      <a href="javascript:void(0)" :class="['menu-link', { active: viewMode === 'question' }]" @click.prevent="viewMode = 'question'">
        练习
      </a>
      <a href="javascript:void(0)" :class="['menu-link', { active: viewMode === 'list' }]" @click.prevent="viewMode = 'list'">
        选题
      </a>
    </nav>
  </section>
</template>

<style scoped>
.test-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.mode-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mode-tab {
  border: none;
  background: transparent;
  color: #6b7280;
  padding: 10px 16px;
  border-bottom: 2px solid transparent;
  font-weight: 700;
  cursor: pointer;
}

.mode-tab.active {
  color: #0f172a;
  border-color: #0f172a;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 18px;
}

.question-panel,
.list-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
}

.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.question-type {
  background: #0f172a;
  color: #ffffff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.question-index {
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
}

.question-content {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.6;
  margin-bottom: 14px;
  font-weight: 400;
}

.question-no {
  margin-right: 6px;
  color: #64748b;
  font-weight: 600;
}

.question-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fill-input {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 16px;
}

.placeholder {
  color: #9aa2b2;
  font-size: 14px;
}

.choice {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px 12px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  font-weight: 400;
  color: #0f172a;
  font-size: 16px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.choice.chosen {
  background: #eef2f7;
  border-color: #1780db;
}

.choice.correct {
  background: #e8f8ef;
  border-color: #22c55e;
}

.choice.wrong {
  background: #f1f5f9;
  border-color: #ef4444;
}

.choice.missed {
  background: #fff6d6;
  border-color: #f59e0b;
}

.submit-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.ghost-btn {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  cursor: pointer;
}

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn {
  border: none;
  background: #0f172a;
  color: #ffffff;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
}

.list-panel {
  max-height: 420px;
  overflow: auto;
}

.list-title {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 12px;
}

.number-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.number-btn {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 8px;
  width: 36px;
  height: 32px;
  padding: 0;
  font-weight: 700;
  cursor: pointer;
  color: #475569;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.number-btn.active {
  border-color: #0f172a;
  background: #e5e7eb;
  color: #111827;
}

.number-btn.answered {
  border-color: #3b82f6;
  color: #3b82f6;
}

.number-btn.correct {
  border-color: #22c55e;
  color: #22c55e;
}

.number-btn.wrong {
  border-color: #ef4444;
  color: #ef4444;
}

.mobile-menu {
  display: none;
}

@media (max-width: 900px) {
  :deep(.topbar) {
    display: none;
  }

  .main-grid {
    grid-template-columns: 1fr;
  }

  .list-panel {
    max-height: 320px;
  }

  .mobile-menu {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-around;
    padding: 12px 16px 14px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    box-shadow: 0 -12px 24px rgba(15, 23, 42, 0.12);
  }

  .menu-link {
    text-decoration: none;
    color: #6b7280;
    font-weight: 700;
    padding: 6px 10px;
    border-bottom: 2px solid transparent;
  }

  .menu-link.active {
    color: #0f172a;
    border-color: #0f172a;
  }
}
</style>
