<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import RadioButton from 'primevue/radiobutton'
import TabMenu from 'primevue/tabmenu'
import Tag from 'primevue/tag'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import type { ChooseProblemType, ProblemType } from '../../base/ProblemTypes'
import { deepCopy } from '../../base/funcs'
import PracticeProgress from '../../base/PracticeProgress'
import { addWrongProblem, getWrongProblemsByTest } from '../../base/wrongProblems'
import { useUserStore } from '../../stores/user'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

type ProblemListType = {
  title: string
  test: [number, number, number, number, number] | number
  score: [number, number, number, number, number]
  problems: ProblemType[]
}

type PracticeRecord = {
  id: string
  testId: string
  testTitle?: string
  updatedAt: number
  practiceMode: number
  progress: ReturnType<InstanceType<typeof PracticeProgress>['toJSON']>
  problemState: number[]
  errorProblems: ProblemType[]
  setType: [boolean, boolean, boolean, boolean, boolean]
  setShuffle: boolean
}

const STORAGE_KEY = 'vtixSave'
const LOCAL_SYNC_KEY = 'vtixLastLocalSaveAt'
const CLOUD_SYNC_KEY = 'vtixLastCloudSyncAt'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
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

const progress = ref<PracticeProgress | null>(null)
const progressId = ref('')
const progressUpdatedAt = ref(0)
const savedRecords = ref<PracticeRecord[]>([])
const showRecords = ref(false)
const hasEverInteracted = ref(false)
const hasDirty = ref(false)
const showCustomConfig = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const localSaveAt = ref<number | null>(null)
const cloudSyncAt = ref<number | null>(null)
const cloudSyncFailed = ref(false)
const canUseLocalStorage = ref(true)
const cloudSyncing = ref(false)
let cloudSyncTimer: number | null = null
let lastCloudSyncAttempt = 0

const nowProblemList = computed(() => progress.value?.problemList ?? [])
const nowProblemId = computed({
  get: () => progress.value?.currentProblemId ?? 0,
  set: (value) => {
    if (!progress.value) return
    progress.value.setCurrentProblem(value)
  }
})
const answerList = computed(() => progress.value?.answerList ?? [])
const nowAnswer = computed<(number | string)[]>({
  get: () => progress.value?.currentAnswer ?? [],
  set: (value) => {
    if (!progress.value) return
    progress.value.updateCurrentAnswer(value)
  }
})
const writeAnswer = ref('')
const problemState = ref<number[]>([])
const errorProblems = ref<ProblemType[]>([])
const currentUserId = computed(() => userStore.user?.id ?? 'guest')

const currentProblem = computed(() => nowProblemList.value[nowProblemId.value])
const currentTypeLabel = computed(() => {
  const type = currentProblem.value?.type ?? 0
  return problemTypes[type] ?? '题目'
})

const isSubmitted = computed(() => problemState.value[nowProblemId.value] >= 2)
const isSingleChoice = computed(
  () => currentProblem.value?.type === 1 || currentProblem.value?.type === 4
)
const isMultiChoice = computed(() => currentProblem.value?.type === 2)
const showFillAnswer = computed(
  () => currentProblem.value?.type === 3 && problemState.value[nowProblemId.value] === 3
)
const fillAnswerText = computed(() => {
  if (!currentProblem.value || currentProblem.value.type !== 3) return ''
  return formatFillAnswer(currentProblem.value)
})
const examTypeOrder = [2, 1, 3, 4, 0]
const examSectionLabels = ['送分题', '单选题', '多选题', '填空题', '判断题']
const cnNumbers = ['一', '二', '三', '四', '五', '六']

const examSections = computed(() => {
  const meta = problemInfo.value.test
  if (!Array.isArray(meta)) return []
  return examTypeOrder
    .map((type) => ({
      type,
      count: meta[type] ?? 0,
      score: problemInfo.value.score?.[type] ?? 0,
      label: examSectionLabels[type] ?? '题目'
    }))
    .filter((section) => section.count > 0)
})

const examNumberGroups = computed(() => {
  if (!isExamMode.value) return []
  const groups = examTypeOrder.map((type) => ({
    type,
    label: examSectionLabels[type] ?? '题目',
    indices: [] as number[]
  }))
  nowProblemList.value.forEach((problem, index) => {
    const group = groups.find((item) => item.type === problem.type)
    if (group) group.indices.push(index)
  })
  return groups.filter((group) => group.indices.length > 0)
})

function getScoreForType(type: number) {
  return problemInfo.value.score?.[type] ?? 0
}

const examMaxScore = computed(() => {
  if (!nowProblemList.value.length) return 0
  return nowProblemList.value.reduce((sum, problem) => sum + getScoreForType(problem.type), 0)
})

const examScore = computed(() => {
  if (!nowProblemList.value.length) return 0
  return nowProblemList.value.reduce((sum, problem, index) => {
    if (problemState.value[index] === 2) {
      return sum + getScoreForType(problem.type)
    }
    return sum
  }, 0)
})

const examScoreText = computed(() => `得分 ${examScore.value} / ${examMaxScore.value}`)

const setType = ref<[boolean, boolean, boolean, boolean, boolean]>([true, true, true, true, true])
const setShuffle = ref(false)

const customTypeOptions = [
  { label: '单选题', type: 1 },
  { label: '多选题', type: 2 },
  { label: '填空题', type: 3 },
  { label: '判断题', type: 4 }
]

const hasCustomTypeSelected = computed(() =>
  customTypeOptions.some((option) => setType.value[option.type])
)

const tabItems = computed(() => [
  ...modes.map((mode) => ({
    label: mode.label,
    command: () => handleModeClick(mode.value)
  })),
  {
    label: '做题记录',
    command: () => {
      showRecords.value = !showRecords.value
    }
  }
])

const menuItems = computed(() => [
  ...modes.map((mode) => ({
    label: mode.label,
    command: () => handleModeClick(mode.value)
  })),
  {
    label: '返回题库',
    command: () => {
      router.push({ name: 'question-bank' })
    }
  }
])

const activeTabIndex = computed(() => Math.max(0, modes.findIndex((mode) => mode.value === practiceMode.value)))

function handleTabChange(event: { index: number }) {
  const mode = modes[event.index]
  if (mode) handleModeClick(mode.value)
}

const correctCount = computed(() => problemState.value.filter((state) => state === 2).length)
const wrongCount = computed(() => problemState.value.filter((state) => state === 3).length)
const answeredCount = computed(() => problemState.value.filter((state) => state > 0).length)
const totalCount = computed(() => nowProblemList.value.length)
const timeSpentSeconds = computed(() => progress.value?.timeSpentSeconds ?? 0)
let timerId: number | null = null
let syncTickerId: number | null = null

const currentModeLabel = computed(() => {
  const mode = modes.find((item) => item.value === practiceMode.value)
  return mode?.label ?? '练习'
})

const accuracyText = computed(() => {
  const wrongCount = problemState.value.filter((state) => state === 3).length
  const answeredCount = correctCount.value + wrongCount
  if (!answeredCount) return '正确率 0%'
  const rate = Math.round((correctCount.value / answeredCount) * 100)
  return `正确率 ${rate}%`
})

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

const examDurationText = computed(() => {
  if (!progress.value) return '总用时 00:00'
  return `总用时 ${formatDuration(timeSpentSeconds.value)}`
})

const isExamMode = computed(() => practiceMode.value === 5)
const examSubmitted = ref(false)

const progressText = computed(() => {
  const total = nowProblemList.value.length
  const current = total ? nowProblemId.value + 1 : 0
  return `${current} / ${total}`
})

const syncStatusLabel = computed(() => {
  if (!canUseLocalStorage.value) return '未同步'
  if (userStore.user) {
    if (cloudSyncFailed.value) return '云端同步失败'
    return cloudSyncAt.value ? '已同步云端' : '未同步'
  }
  return localSaveAt.value ? '本地已同步' : '未同步'
})

const syncStatusTooltip = computed(() => {
  syncTick.value
  if (!canUseLocalStorage.value) return '未同步'
  if (userStore.user) {
    if (cloudSyncFailed.value) return '云端同步失败'
    if (!cloudSyncAt.value) return '未同步'
    const distance = formatDistanceToNow(cloudSyncAt.value, {
      addSuffix: true,
      locale: zhCN
    })
    return `最新云端同步：${distance}`
  }
  if (!localSaveAt.value) return '未同步'
  const distance = formatDistanceToNow(localSaveAt.value, {
    addSuffix: true,
    locale: zhCN
  })
  return `最新保存：${distance}`
})

const syncAgoText = computed(() => {
  syncTick.value
  if (!canUseLocalStorage.value) return '未同步'
  if (userStore.user) {
    if (cloudSyncFailed.value) return '云端同步失败'
    if (!cloudSyncAt.value) return '未同步'
    const distance = formatDistanceToNow(cloudSyncAt.value, {
      addSuffix: true,
      locale: zhCN
    })
    return `${distance}同步`
  }
  if (!localSaveAt.value) return '未同步'
  const distance = formatDistanceToNow(localSaveAt.value, {
    addSuffix: true,
    locale: zhCN
  })
  return `${distance}同步`
})

const syncTick = ref(0)

const mobileMenuItems = [
  { label: '菜单', value: 'menu' as const },
  { label: '练习', value: 'question' as const },
  { label: '选题', value: 'list' as const },
  { label: '记录', value: 'records' as const }
]

const matchingRecords = computed(() =>
  savedRecords.value
    .filter((item) => item.testId === testId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
)

const singleChoice = computed<number | null>({
  get: () => (typeof nowAnswer.value[0] === 'number' ? (nowAnswer.value[0] as number) : null),
  set: (value) => {
    if (value === null || isSubmitted.value) return
    choose(value)
  }
})

const multiChoice = computed<number[]>({
  get: () => nowAnswer.value.filter((value): value is number => typeof value === 'number'),
  set: (value) => {
    if (isSubmitted.value) return
    nowAnswer.value = value
    markInteraction()
  }
})

function setTitle(title: string) {
  document.title = title
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

function handleKeydown(event: KeyboardEvent) {
  if (loading.value) return
  if (isTypingTarget(event.target)) return
  if (!currentProblem.value) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  const key = event.key.toLowerCase()
  if (key === 'enter') {
    submitAnswer()
    return
  }
  if (key === 'arrowleft') {
    if (nowProblemId.value > 0) {
      nowProblemId.value -= 1
    }
    return
  }
  if (key === 'arrowright') {
    if (nowProblemId.value + 1 < nowProblemList.value.length) {
      nowProblemId.value += 1
    }
    return
  }

  const keyMap: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4, y: 5 }
  const choiceIndex = keyMap[key]
  if (choiceIndex === undefined) return

  const choicesList = (currentProblem.value as ChooseProblemType).choices ?? []
  if (choiceIndex >= choicesList.length) return

  event.preventDefault()
  choose(choiceIndex)
}

function generateProgressId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readRecords(): PracticeRecord[] {
  if (!window.localStorage) return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.id === 'string' && item.progress)
  } catch (error) {
    return []
  }
}

function writeRecords(records: PracticeRecord[]) {
  if (!window.localStorage) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  const now = Date.now()
  localStorage.setItem(LOCAL_SYNC_KEY, String(now))
  localSaveAt.value = now
}

function syncRecords() {
  savedRecords.value = readRecords()
}

function loadLocalSyncTime() {
  try {
    const testKey = '__vtix_ls_test'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    canUseLocalStorage.value = true
    const raw = Number(localStorage.getItem(LOCAL_SYNC_KEY))
    localSaveAt.value = Number.isFinite(raw) && raw > 0 ? raw : null
    const cloudRaw = Number(localStorage.getItem(CLOUD_SYNC_KEY))
    cloudSyncAt.value = Number.isFinite(cloudRaw) && cloudRaw > 0 ? cloudRaw : null
  } catch (error) {
    canUseLocalStorage.value = false
    localSaveAt.value = null
    cloudSyncAt.value = null
  }
}

function normalizeRecords(list: PracticeRecord[]) {
  return list
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({
      ...item,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0
    }))
}

function serializeRecords(list: PracticeRecord[]) {
  return JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)))
}

function mergeByUpdatedAt(local: PracticeRecord[], remote: PracticeRecord[]) {
  const localMap = new Map(local.map((item) => [item.id, item]))
  const remoteMap = new Map(remote.map((item) => [item.id, item]))
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()])
  const merged: PracticeRecord[] = []
  let conflicts = 0
  for (const id of ids) {
    const localItem = localMap.get(id)
    const remoteItem = remoteMap.get(id)
    if (localItem && remoteItem) {
      if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
        conflicts += 1
      }
      const localTime = localItem.updatedAt ?? 0
      const remoteTime = remoteItem.updatedAt ?? 0
      merged.push(localTime >= remoteTime ? localItem : remoteItem)
    } else if (localItem) {
      merged.push(localItem)
    } else if (remoteItem) {
      merged.push(remoteItem)
    }
  }
  const trimmed = merged
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
    .slice(Math.max(0, merged.length - 10))
  return { merged: trimmed, conflicts }
}

async function syncCloudRecords() {
  if (!userStore.user) return
  if (!canUseLocalStorage.value) return
  if (cloudSyncing.value) return
  const now = Date.now()
  if (now - lastCloudSyncAttempt < 4000) return
  lastCloudSyncAttempt = now
  cloudSyncing.value = true
  try {
    const localRecords = normalizeRecords(readRecords())
    const response = await fetch(`${apiBase}/api/records`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`同步失败: ${response.status}`)
    }
    const data = (await response.json()) as { records?: PracticeRecord[] }
    const remoteRecords = normalizeRecords(Array.isArray(data.records) ? data.records : [])
    const { merged } = mergeByUpdatedAt(localRecords, remoteRecords)
    const localChanged = serializeRecords(merged) !== serializeRecords(localRecords)
    const remoteChanged = serializeRecords(merged) !== serializeRecords(remoteRecords)
    let finalRecords = merged
    if (remoteChanged) {
      const upload = await fetch(`${apiBase}/api/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ records: merged })
      })
      if (!upload.ok) {
        throw new Error(`同步失败: ${upload.status}`)
      }
      const uploadData = (await upload.json()) as { records?: PracticeRecord[] }
      finalRecords = normalizeRecords(Array.isArray(uploadData.records) ? uploadData.records : merged)
    }
    if (localChanged) {
      writeRecords(finalRecords)
    }
    cloudSyncFailed.value = false
    cloudSyncAt.value = Date.now()
    localStorage.setItem(CLOUD_SYNC_KEY, String(cloudSyncAt.value))
  } catch (error) {
    cloudSyncFailed.value = true
  } finally {
    cloudSyncing.value = false
  }
}

function scheduleCloudSync(delay = 1200) {
  if (!userStore.user) return
  if (!canUseLocalStorage.value) return
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
  }
  cloudSyncTimer = window.setTimeout(() => {
    void syncCloudRecords()
  }, delay)
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

function getRecordAnsweredCount(record: PracticeRecord) {
  if (Array.isArray(record.problemState)) {
    return record.problemState.filter((state) => state > 0).length
  }
  const submitted = record.progress?.submittedList
  if (Array.isArray(submitted)) {
    return submitted.filter(Boolean).length
  }
  const answerList = record.progress?.answerList
  if (Array.isArray(answerList)) {
    return answerList.filter((answer) => Array.isArray(answer) && answer.length > 0).length
  }
  const current = record.progress?.currentProblemId ?? -1
  const total = record.progress?.problemList?.length ?? 0
  return Math.min(Math.max(0, current + 1), total)
}

function getModeLabel(value: number) {
  return modes.find((item) => item.value === value)?.label ?? '练习'
}

function markInteraction(saveNow = true) {
  hasEverInteracted.value = true
  hasDirty.value = true
  if (saveNow) {
    saveCurrentRecord()
  }
}

function formatFileTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}-${hours}${minutes}`
}

function shuffleList(list: ProblemType[]) {
  const copy = deepCopy(list)
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function shuffleProblemChoices(problem: ProblemType) {
  if (problem.type === 3) return problem
  const choicesList = [...problem.choices]
  const indices = choicesList.map((_, index) => index)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const newChoices = indices.map((index) => choicesList[index])
  if (problem.type === 2) {
    const newAnswer = problem.answer.map((answer) => indices.indexOf(answer)).sort((a, b) => a - b)
    return {
      ...problem,
      choices: newChoices,
      answer: newAnswer
    }
  }
  const newAnswer = indices.indexOf(problem.answer)
  if (problem.type === 4) {
    return {
      ...problem,
      choices: [newChoices[0], newChoices[1]],
      answer: newAnswer
    }
  }
  return {
    ...problem,
    choices: newChoices,
    answer: newAnswer
  }
}

function buildRandomizedList(list: ProblemType[]) {
  const copy = deepCopy(list).map((problem) => shuffleProblemChoices(problem))
  return shuffleList(copy)
}

function createProgress(problemList: ProblemType[], mode: number) {
  const newProgress = new PracticeProgress({
    testId,
    problemList,
    currentProblemId: 0
  })
  progress.value = newProgress
  progressId.value = generateProgressId()
  progressUpdatedAt.value = Date.now()
  hasEverInteracted.value = false
  hasDirty.value = false
  showCustomConfig.value = false
  practiceMode.value = mode
  problemState.value = Array(problemList.length).fill(0)
  writeAnswer.value = ''
  examSubmitted.value = false
  showRecords.value = false
}

function normalizeRecord(record: PracticeRecord) {
  const list = Array.isArray(record.progress.problemList) ? record.progress.problemList : []
  const answerList =
    Array.isArray(record.progress.answerList) && record.progress.answerList.length === list.length
      ? record.progress.answerList
      : list.map(() => [])
  const currentProblemId =
    typeof record.progress.currentProblemId === 'number'
      ? Math.min(Math.max(0, record.progress.currentProblemId), Math.max(0, list.length - 1))
      : 0
  const problemState =
    Array.isArray(record.problemState) && record.problemState.length === list.length
      ? record.problemState
      : Array(list.length).fill(0)
  const submittedList =
    Array.isArray(record.progress.submittedList) && record.progress.submittedList.length === list.length
      ? record.progress.submittedList
      : problemState.map((state) => state > 0)
  return {
    ...record,
    progress: {
      ...record.progress,
      problemList: list,
      answerList,
      submittedList,
      currentProblemId
    },
    problemState
  }
}

function applyRecord(record: PracticeRecord) {
  const normalized = normalizeRecord(record)
  const data = normalized.progress
  const newProgress = new PracticeProgress({
    testId: normalized.testId,
    problemList: data.problemList,
    timeSpentSeconds: data.timeSpentSeconds,
    currentProblemId: data.currentProblemId,
    answerList: data.answerList,
    submittedList: data.submittedList
  })
  if (data.correctAnswerList) {
    newProgress.correctAnswerList = data.correctAnswerList
  }
  if (Array.isArray(data.currentAnswer)) {
    newProgress.currentAnswer = data.currentAnswer
  }
  newProgress.setCurrentProblem(data.currentProblemId)
  progress.value = newProgress
  practiceMode.value = normalized.practiceMode
  setType.value = normalized.setType ?? setType.value
  setShuffle.value = normalized.setShuffle ?? setShuffle.value
  problemState.value = normalized.problemState
  errorProblems.value = normalized.errorProblems ?? []
  progressId.value = normalized.id
  progressUpdatedAt.value = normalized.updatedAt
  hasEverInteracted.value = false
  hasDirty.value = false
  showCustomConfig.value = false
  writeAnswer.value = ''
  if (currentProblem.value?.type === 3) {
    writeAnswer.value = String(nowAnswer.value[0] ?? '')
  }
  showRecords.value = false
  examSubmitted.value =
    practiceMode.value === 5 && problemState.value.length > 0 && problemState.value.every((state) => state >= 2)
}

function saveCurrentRecord() {
  if (!progress.value || !window.localStorage) return
  if (!hasEverInteracted.value || !hasDirty.value) return
  if (!progressId.value) {
    progressId.value = generateProgressId()
  }
  progressUpdatedAt.value = Date.now()
  const record: PracticeRecord = {
    id: progressId.value,
    testId,
    testTitle: testTitle.value,
    updatedAt: progressUpdatedAt.value,
    practiceMode: practiceMode.value,
    progress: progress.value.toJSON(),
    problemState: [...problemState.value],
    errorProblems: deepCopy(errorProblems.value),
    setType: [...setType.value] as [boolean, boolean, boolean, boolean, boolean],
    setShuffle: setShuffle.value
  }
  let records = readRecords().filter((item) => item.id !== record.id)
  records.push(record)
  records = records
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(Math.max(0, records.length - 10))
  writeRecords(records)
  savedRecords.value = records
  hasDirty.value = false
  scheduleCloudSync()
}

function deleteRecord(recordId: string) {
  const records = readRecords().filter((item) => item.id !== recordId)
  writeRecords(records)
  savedRecords.value = records
}

function loadRecord(recordId: string) {
  const record = readRecords().find((item) => item.id === recordId)
  if (!record || record.testId !== testId) return false
  applyRecord(record)
  return true
}

function exportRecords() {
  const records = readRecords().filter((item) => item.testId === testId)
  const payload = {
    version: 1,
    testId,
    exportedAt: Date.now(),
    records
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `vtix-records-${testId}-${formatFileTimestamp(Date.now())}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function triggerImport() {
  importInput.value?.click()
}

function toRecord(raw: any): PracticeRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const progressData = raw.progress
  if (!progressData || !Array.isArray(progressData.problemList)) return null
  const setType =
    Array.isArray(raw.setType) && raw.setType.length === 5
      ? (raw.setType as [boolean, boolean, boolean, boolean, boolean])
      : ([false, true, true, true, true] as [boolean, boolean, boolean, boolean, boolean])
  const record: PracticeRecord = {
    id: typeof raw.id === 'string' ? raw.id : generateProgressId(),
    testId: typeof raw.testId === 'string' ? raw.testId : testId,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    practiceMode: typeof raw.practiceMode === 'number' ? raw.practiceMode : 0,
    progress: progressData,
    problemState: Array.isArray(raw.problemState) ? raw.problemState : Array(progressData.problemList.length).fill(0),
    errorProblems: Array.isArray(raw.errorProblems) ? raw.errorProblems : [],
    setType,
    setShuffle: Boolean(raw.setShuffle)
  }
  return normalizeRecord(record)
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const rawRecords = Array.isArray(parsed) ? parsed : parsed?.records
    if (!Array.isArray(rawRecords)) return
    const incoming = rawRecords
      .map(toRecord)
      .filter((record): record is PracticeRecord => Boolean(record))
      .filter((record) => record.testId === testId)
    if (!incoming.length) return
    const existing = readRecords()
    const recordMap = new Map(existing.map((item) => [item.id, item]))
    for (const record of incoming) {
      recordMap.set(record.id, record)
    }
    let merged = Array.from(recordMap.values())
    merged = merged
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(Math.max(0, merged.length - 10))
    writeRecords(merged)
    savedRecords.value = merged
  } catch (error) {
    // ignore invalid files
  } finally {
    input.value = ''
  }
}

function loadLatestRecord() {
  const records = readRecords()
    .filter((item) => item.testId === testId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (!records.length) return false
  applyRecord(records[0])
  return true
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
  saveCurrentRecord()
  practiceMode.value = mode
  if (mode === 0) {
    createProgress(deepCopy(problemInfo.value.problems), mode)
  } else if (mode === 1) {
    createProgress(buildRandomizedList(problemInfo.value.problems), mode)
  } else if (mode === 2) {
    showCustomConfig.value = true
    setType.value = [false, true, true, true, true]
    setShuffle.value = false
  } else if (mode === 4) {
    const wrongList = getWrongProblemsByTest(currentUserId.value, testId).map((item) => item.problem)
    errorProblems.value = wrongList
    createProgress(deepCopy(wrongList), mode)
  } else if (mode === 5) {
    createProgress(buildTestList(), mode)
  }
  saveCurrentRecord()
}

function buildTestList() {
  const base = problemInfo.value.problems
  const meta = problemInfo.value.test
  if (Array.isArray(meta)) {
    const list: ProblemType[] = []
    for (const type of examTypeOrder) {
      const count = meta[type]
      if (count <= 0) continue
      const pool = base.filter((p) => p.type === type)
      list.push(...pool.slice(0, count))
    }
    return list.length ? list : base
  }
  return base.slice(0, Math.min(meta, base.length))
}

function choose(index: number) {
  if (!currentProblem.value) return
  if (isSubmitted.value) return
  if (currentProblem.value.type === 1 || currentProblem.value.type === 4) {
    markInteraction(false)
    nowAnswer.value = [index]
    submitAnswer()
    return
  }
  if (nowAnswer.value.includes(index)) {
    nowAnswer.value = nowAnswer.value.filter((item) => item !== index)
  } else {
    nowAnswer.value = [...nowAnswer.value, index]
  }
  markInteraction()
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
    addWrongProblem({
      userId: currentUserId.value,
      testId,
      testTitle: testTitle.value,
      problem,
      userAnswer: Array.isArray(nowAnswer.value) ? [...nowAnswer.value] : null
    })
  }
  progress.value?.markSubmitted(nowProblemId.value)
}

function formatFillAnswer(problem: ProblemType) {
  return problem.answer
    .split(',')
    .map((part) =>
      part
        .split(';')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .join(' / ')
    )
    .filter((value) => value.length > 0)
    .join(' ，')
}

function isFillAnswerCorrect(problem: ProblemType, rawAnswer: string) {
  const normalized = normalizeFill(rawAnswer)
  const userParts = normalized.split(',').map((value) => value.trim())
  const answers = problem.answer.split(',').map((value) => value.trim())
  if (userParts.length !== answers.length) return false
  for (let i = 0; i < answers.length; i += 1) {
    const allowed = answers[i].split(';').map((value) => value.trim())
    if (!allowed.includes(userParts[i])) {
      return false
    }
  }
  return true
}

function evaluateProblem(problem: ProblemType, rawAnswer: (number | string)[] | undefined) {
  if (problem.type === 1 || problem.type === 4) {
    const answers = Array.isArray(rawAnswer)
      ? rawAnswer.filter((value): value is number => typeof value === 'number')
      : []
    return answers.includes(problem.answer)
  }
  if (problem.type === 2) {
    const answers = Array.isArray(rawAnswer)
      ? rawAnswer.filter((value): value is number => typeof value === 'number')
      : []
    const correctSet = new Set(problem.answer)
    const userSet = new Set(answers)
    if (correctSet.size !== userSet.size) return false
    for (const answer of correctSet) {
      if (!userSet.has(answer)) return false
    }
    return true
  }
  if (problem.type === 3) {
    const answerText = Array.isArray(rawAnswer) ? String(rawAnswer[0] ?? '') : ''
    return isFillAnswerCorrect(problem, answerText)
  }
  return false
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId)
    timerId = null
  }
}

function syncExamAnswer() {
  if (!currentProblem.value) return
  if (currentProblem.value.type === 3) {
    nowAnswer.value = [normalizeFill(writeAnswer.value)]
  }
  answerList.value[nowProblemId.value] = [...nowAnswer.value]
}

function submitExam() {
  if (!progress.value) return
  if (examSubmitted.value) return
  syncExamAnswer()
  errorProblems.value = []
  for (let i = 0; i < nowProblemList.value.length; i += 1) {
    const problem = nowProblemList.value[i]
    const answer = answerList.value[i]
    const passed = evaluateProblem(problem, answer)
    problemState.value[i] = passed ? 2 : 3
    if (!passed) {
      errorProblems.value.push(problem)
      addWrongProblem({
        userId: currentUserId.value,
        testId,
        testTitle: testTitle.value,
        problem,
        userAnswer: Array.isArray(answer) ? [...answer] : null
      })
    }
    progress.value.markSubmitted(i)
  }
  examSubmitted.value = true
  markInteraction(false)
  saveCurrentRecord()
}

function submitAnswer() {
  if (!currentProblem.value) return
  if (practiceMode.value === 5 && examSubmitted.value) return
  markInteraction(false)
  if (practiceMode.value === 5) {
    if (currentProblem.value.type === 3) {
      nowAnswer.value = [normalizeFill(writeAnswer.value)]
    }
    answerList.value[nowProblemId.value] = [...nowAnswer.value]
    problemState.value[nowProblemId.value] = 1
    progress.value?.markSubmitted(nowProblemId.value)
    if (nowProblemId.value + 1 < nowProblemList.value.length) {
      nowProblemId.value += 1
    }
    saveCurrentRecord()
    return
  }
  checkAnswer()
  if (problemState.value[nowProblemId.value] === 2 && nowProblemId.value + 1 < nowProblemList.value.length) {
    nowProblemId.value += 1
  }
  saveCurrentRecord()
}

function handleModeClick(mode: number) {
  showRecords.value = false
  setMode(mode)
  viewMode.value = 'question'
  examSubmitted.value = false
}

function startCustomPractice() {
  const base = problemInfo.value.problems
  const filtered = base.filter((problem) => setType.value[problem.type])
  const list = setShuffle.value ? buildRandomizedList(filtered) : deepCopy(filtered)
  createProgress(list, 2)
  viewMode.value = 'question'
}

function handleFillInput() {
  if (!currentProblem.value || currentProblem.value.type !== 3) return
  if (isSubmitted.value) return
  nowAnswer.value = [writeAnswer.value]
  markInteraction()
}

// records are handled via saveCurrentRecord/loadLatestRecord

async function loadProblem() {
  try {
    const response = await fetch(`${apiBase}/api/problem-sets/${testId}`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as ProblemListType
    problemInfo.value = data
    loading.value = false
    syncRecords()
    const recordId = typeof route.query.record === 'string' ? route.query.record : ''
    if (recordId && loadRecord(recordId)) {
      return
    }
    if (loadLatestRecord()) {
      return
    }
    setMode(0)
  } catch (error) {
    loading.value = false
    loadError.value = error instanceof Error ? error.message : '加载失败'
    router.push('/notfound')
  }
}

onMounted(() => {
  setTitle(testTitle.value)
  loadLocalSyncTime()
  if (userStore.user) {
    scheduleCloudSync(300)
  }
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
  window.addEventListener('keydown', handleKeydown)
  syncTickerId = window.setInterval(() => {
    if (!canUseLocalStorage.value) return
    if (!localSaveAt.value && !cloudSyncAt.value) return
    syncTick.value += 1
  }, 1000)
  timerId = window.setInterval(() => {
    if (practiceMode.value === 5 && examSubmitted.value) return
    if (progress.value) {
      progress.value.timeSpentSeconds += 1
      if (hasEverInteracted.value) {
        hasDirty.value = true
      }
    }
  }, 1000)
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
  window.removeEventListener('keydown', handleKeydown)
  stopTimer()
  if (syncTickerId !== null) {
    window.clearInterval(syncTickerId)
    syncTickerId = null
  }
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
  saveCurrentRecord()
  void syncCloudRecords()
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
})

onBeforeRouteLeave(() => {
  saveCurrentRecord()
  void syncCloudRecords()
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
})

watch(
  () => userStore.user?.id,
  (value) => {
    if (value) {
      scheduleCloudSync(300)
    }
  }
)

watch(testTitle, (value) => {
  setTitle(value)
})

watch(nowProblemId, () => {
  if (currentProblem.value?.type === 3) {
    writeAnswer.value = String(nowAnswer.value[0] ?? '')
  } else {
    writeAnswer.value = ''
  }
  if (hasEverInteracted.value) {
    hasDirty.value = true
    saveCurrentRecord()
  }
})
</script>

<template>
  <section class="test-page">
    <header class="page-head">
      <div class="page-title">
        <div class="eyebrow" @click="router.push({ name: 'question-bank' })">
          <span v-if="isMobile" class="back-link">
            <span class="back-icon">‹</span>
          </span>
          vtix 答题自测
        </div>
        <h1>{{ testTitle }}</h1>
      </div>
    </header>

    <div class="mode-tabs" v-show="!isMobile || (viewMode === 'menu' && !showRecords)">
      <TabMenu v-if="!isMobile" :model="tabItems" :activeIndex="activeTabIndex" @tab-change="handleTabChange" />
      <Menu v-else :model="menuItems" class="mobile-mode-menu" />
    </div>

    <section v-if="showRecords" class="record-panel">
      <div class="record-head">
        <span>做题记录</span>
        <div class="record-tools">
          <Button size="small" label="导出" severity="secondary" text @click="exportRecords" />
          <Button size="small" label="导入" severity="secondary" text @click="triggerImport" />
          <input ref="importInput" type="file" accept="application/json" class="record-file" @change="handleImport" />
        </div>
      </div>
      <div v-if="matchingRecords.length === 0" class="record-empty">暂无记录</div>
      <div v-else class="record-list">
        <div v-for="record in matchingRecords" :key="record.id" class="record-item">
          <div class="record-info">
            <div class="record-title">{{ getModeLabel(record.practiceMode) }}</div>
            <div class="record-meta">
              {{ formatTimestamp(record.updatedAt) }} ·
              {{ formatDuration(record.progress.timeSpentSeconds ?? 0) }} ·
              {{ getRecordAnsweredCount(record) }}/{{ record.progress.problemList.length }}
            </div>
          </div>
          <div class="record-actions">
            <Button size="small" label="继续" @click="loadRecord(record.id)" />
            <Button size="small" label="删除" severity="danger" text @click="deleteRecord(record.id)" />
          </div>
        </div>
      </div>
    </section>

    <div class="main-grid" v-show="!showRecords">
      <section class="custom-panel" v-if="showCustomConfig" v-show="!isMobile || viewMode === 'question'">
        <div class="custom-head">
          <span class="custom-title">自定义练习</span>
          <p>选择题型与是否打乱题目顺序</p>
        </div>
        <div class="custom-section">
          <div class="custom-label">题型选择</div>
          <div class="custom-options">
            <label v-for="option in customTypeOptions" :key="option.type" class="custom-option">
              <Checkbox v-model="setType[option.type]" :binary="true" />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
        <div class="custom-section">
          <label class="custom-option">
            <Checkbox v-model="setShuffle" :binary="true" />
            <span>打乱题目顺序与选项顺序</span>
          </label>
        </div>
        <div class="custom-actions">
          <Button type="button" label="开始练习" :disabled="!hasCustomTypeSelected" @click="startCustomPractice" />
        </div>
      </section>

      <section class="question-panel" v-else v-show="!isMobile || viewMode === 'question'">
        <div class="question-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="question-type">{{ currentTypeLabel }}</span>
            <div v-if="!isMobile" class="sync-tag">
              <Tag
                :value="syncStatusLabel"
                :severity="syncStatusLabel === '未同步' ? 'secondary' : (syncStatusLabel === '云端同步失败' ? 'danger' : 'success')"
                rounded
                v-tooltip.bottom="syncStatusTooltip"
              />
            </div>
          </div>
          <span class="question-index">{{ nowProblemList.length ? nowProblemId + 1 : 0 }}/{{ nowProblemList.length
          }}</span>
        </div>

        <div class="question-content">
          <span class="question-no">{{ nowProblemId + 1 }}.</span>
          {{ currentProblem?.content }}
        </div>
        <div class="question-choices" v-if="currentProblem && currentProblem.type !== 3">
          <label v-for="(choice, idx) in (currentProblem as ChooseProblemType).choices" :key="choice"
            :class="['choice-row', 'p-ripple', getChoiceClass(idx)]" :for="`choice-${idx}`" v-ripple>
            <RadioButton v-if="isSingleChoice" v-model="singleChoice" :inputId="`choice-${idx}`" :value="idx"
              :disabled="isSubmitted" />
            <Checkbox v-else-if="isMultiChoice" v-model="multiChoice" :inputId="`choice-${idx}`" :value="idx"
              :disabled="isSubmitted" />
            <span v-else class="choice-bullet" />
            <span class="choice-label">
              {{ choices[idx] }}. {{ choice }}
            </span>
          </label>
        </div>
        <div class="question-choices" v-else-if="currentProblem && currentProblem.type === 3">
          <InputText v-model="writeAnswer" class="fill-input" placeholder="请输入答案，多个答案用逗号隔开" :disabled="isSubmitted"
            @input="handleFillInput" />
          <div v-if="showFillAnswer" class="fill-answer">
            <span>正确答案：</span>
            <span>{{ fillAnswerText }}</span>
          </div>
        </div>
        <div class="question-choices" v-else>
          <span class="placeholder">暂无题目</span>
        </div>
        <div class="submit-row">
          <Button type="button" label="上一题" severity="secondary" :disabled="nowProblemId === 0"
            @click="nowProblemId -= 1" />
          <Button type="button" label="下一题" severity="secondary" :disabled="nowProblemId + 1 >= nowProblemList.length"
            @click="nowProblemId += 1" />
          <Button type="button" label="提交" @click="submitAnswer" />
          <Button v-if="isExamMode" type="button" label="交卷" severity="info" :disabled="examSubmitted"
            @click="submitExam" />
        </div>
      </section>

      <aside class="list-panel" v-show="(!isMobile || viewMode === 'list') && !showCustomConfig">
        <div class="list-title">题目编号</div>
        <div class="list-summary" v-if="!isMobile">
          <span v-if="!isExamMode" class="summary-tag is-correct">正确 {{ correctCount }}</span>
          <span v-else class="summary-tag is-answered">作答 {{ answeredCount }}</span>
          <span class="summary-tag is-total">总计 {{ totalCount }}</span>
          <span v-if="!isExamMode" class="summary-tag is-rate">{{ accuracyText }}</span>
          <span v-else class="summary-tag is-time">{{ examDurationText }}</span>
        </div>
        <div v-if="isExamMode && examSubmitted" class="exam-result">
          <div class="exam-score">得分 {{ examScore }} / {{ examMaxScore }}</div>
          <div class="exam-score-sub">正确 {{ correctCount }} · 错误 {{ wrongCount }}</div>
        </div>
        <div v-if="isExamMode" class="exam-number-groups">
          <div v-for="(group, groupIndex) in examNumberGroups" :key="group.type" class="exam-number-group">
            <div class="exam-number-title">
              <span class="exam-index">{{ cnNumbers[groupIndex] ?? groupIndex + 1 }}、</span>
              <span>{{ group.label }}</span>
              <span class="exam-meta">（{{ group.indices.length }}题，每题{{ getScoreForType(group.type) }}分）</span>
            </div>
            <div class="number-grid">
              <div v-for="index in group.indices" :key="index" :class="[
                'number-btn',
                {
                  active: index === nowProblemId,
                  answered: problemState[index] === 1,
                  correct: problemState[index] === 2,
                  wrong: problemState[index] === 3
                }
              ]" role="button" tabindex="0" @click="
                () => {
                  nowProblemId = index
                  viewMode = 'question'
                }
              " @keydown.enter="
                () => {
                  nowProblemId = index
                  viewMode = 'question'
                }
              ">
                {{ index + 1 }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="number-grid">
          <div v-for="(item, index) in nowProblemList" :key="index" :class="[
            'number-btn',
            {
              active: index === nowProblemId,
              answered: problemState[index] === 1,
              correct: problemState[index] === 2,
              wrong: problemState[index] === 3
            }
          ]" role="button" tabindex="0" @click="
            () => {
              nowProblemId = index
              viewMode = 'question'
            }
          " @keydown.enter="
            () => {
              nowProblemId = index
              viewMode = 'question'
            }
          ">
            {{ index + 1 }}
          </div>
        </div>
      </aside>
    </div>

    <nav class="mobile-menu">
      <button v-for="item in mobileMenuItems" :key="item.value" type="button"
        :class="['dock-item', 'p-ripple', { active: item.value === 'records' ? showRecords : (!showRecords && viewMode === item.value) }]"
        v-ripple @click="
          () => {
            if (item.value === 'records') {
              showRecords = true
              viewMode = 'question'
              return
            }
            viewMode = item.value
            showRecords = false
          }
        ">
        <span class="dock-title" v-if="item.value === 'question'">{{ currentModeLabel }}</span>
        <span class="dock-title" v-else>{{ item.label }}</span>
        <span v-if="item.value === 'question'" class="dock-sub is-accent">
          {{ isExamMode ? (examSubmitted ? examScoreText : examDurationText) : accuracyText }}
        </span>
        <span v-else-if="item.value === 'list'" class="dock-sub is-progress">{{ progressText }}</span>
        <span v-else-if="item.value === 'records'" class="dock-sub">{{ syncAgoText }}</span>
      </button>
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
  font-size: 32px;
  color: #0f172a;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.page-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: 100%;
}

.sync-tag {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #5f6672;
  line-height: 1;
}

.back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #111827;
  cursor: pointer;
}

.back-icon {
  font-size: 20px;
  line-height: 1;
}

.mode-tabs :deep(.p-tabmenu-nav) {
  border: none;
  background: transparent;
  gap: 10px;
}

.mode-tabs :deep(.p-tabmenuitem) {
  margin-right: 0;
}

.mode-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: #6b7280;
  font-weight: 700;
  padding: 8px 14px;
}

.mode-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: #f1f3f6;
  color: #0f172a;
  border-color: #e5e7eb;
}

.mode-tabs :deep(.mobile-mode-menu.p-menu) {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-list) {
  padding: 6px;
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-item-link) {
  border-radius: 10px;
  padding: 12px 16px;
  color: #111827;
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-item-link:hover) {
  background: #f3f4f6;
}

.record-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  color: #0f172a;
}

.record-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.record-file {
  display: none;
}

.record-empty {
  color: #9aa2b2;
  font-size: 13px;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}

.record-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-title {
  font-weight: 700;
  color: #0f172a;
}

.record-meta {
  font-size: 12px;
  color: #64748b;
}

.record-actions {
  display: inline-flex;
  gap: 8px;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.question-panel,
.list-panel,
.custom-panel {
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
  white-space: pre-wrap;
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

.custom-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.custom-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.custom-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.custom-head p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.custom-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-label {
  font-weight: 700;
  color: #0f172a;
  font-size: 14px;
}

.custom-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.custom-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}

.custom-actions {
  display: flex;
  justify-content: flex-end;
}

.fill-input {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 16px;
}

.fill-answer {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #fde68a;
  background: #fef9c3;
  color: #92400e;
  font-size: 13px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.placeholder {
  color: #9aa2b2;
  font-size: 14px;
}

.choice-row {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 400;
  color: #0f172a;
  font-size: 16px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.choice-row:hover {
  background: #f3f4f6;
  border-color: #e5e7eb;
}

.choice-label {
  flex: 1;
  text-align: left;
  display: block;
  width: 100%;
}

.choice-row.chosen {
  background: #eef2f7;
  border-color: #1780db;
}

.choice-row.correct {
  background: #e8f8ef;
  border-color: #22c55e;
}

.choice-row.wrong {
  background: #ffffff;
  border-color: #ef4444;
}

.choice-row.missed {
  background: #fff6d6;
  border-color: #f59e0b;
}

.submit-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-start;
  gap: 10px;
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

.list-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  margin-bottom: 12px;
}

.exam-sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  color: #475569;
  font-size: 13px;
}

.exam-section {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.exam-index {
  font-weight: 700;
  color: #0f172a;
}

.exam-meta {
  color: #94a3b8;
}

.exam-result {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #cbd5f5;
  background: #eef2ff;
  color: #1e1b4b;
  font-size: 13px;
  margin-bottom: 12px;
}

.exam-score {
  font-weight: 800;
  color: #1e1b4b;
}

.exam-score-sub {
  margin-top: 4px;
  color: #4c51bf;
}

.summary-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.summary-tag.is-correct {
  background: #e8f8ef;
  color: #15803d;
  border-color: #86efac;
}

.summary-tag.is-total {
  background: #eef2ff;
  color: #4338ca;
  border-color: #c7d2fe;
}

.summary-tag.is-rate {
  background: #fff6d6;
  color: #b45309;
  border-color: #fcd34d;
}

.summary-tag.is-answered {
  background: #e0f2fe;
  color: #0369a1;
  border-color: #7dd3fc;
}

.summary-tag.is-time {
  background: #ede9fe;
  color: #6d28d9;
  border-color: #c4b5fd;
}

.exam-number-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exam-number-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exam-number-title {
  font-weight: 700;
  color: #0f172a;
  font-size: 13px;
}

.number-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.number-btn {
  background: #ffffff;
  border-radius: 8px;
  width: 36px;
  height: 32px;
  padding: 0;
  font-weight: 700;
  cursor: pointer;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  user-select: none;
  box-shadow: 0 8px 10px rgba(15, 23, 42, 0.08);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.number-btn:hover {
  background: #f3f4f6;
}

.number-btn.active {
  border-color: #0f172a !important;
  background: #e5e7eb !important;
  color: #111827 !important;
}

.number-btn.answered {
  border-color: #3b82f6 !important;
  color: #3b82f6 !important;
}

.number-btn.correct {
  border-color: #22c55e !important;
  color: #22c55e !important;
}

.number-btn.wrong {
  border-color: #ef4444 !important;
  color: #ef4444 !important;
}

.number-btn.answered:hover,
.number-btn.correct:hover,
.number-btn.wrong:hover {
  background: #f3f4f6;
  border-color: currentColor;
}

.mobile-menu {
  display: none;
}

@media (max-width: 900px) {
  :deep(.topbar) {
    display: none;
  }

  .test-page {
    --mobile-header-height: 96px;
    --mobile-menu-height: 56px;
    --mobile-gap: 18px;
    height: calc(100vh - var(--mobile-menu-height) - 10px);
    gap: var(--mobile-gap);
    padding-bottom: var(--mobile-menu-height);
  }

  .page-head {
    display: flex;
    align-items: center;
  }

  .main-grid {
    grid-template-columns: 1fr;
    flex: 1;
    min-height: 0;
  }

  .record-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .record-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .question-panel,
  .list-panel {
    max-height: none;
    height: 100%;
    overflow: auto;
  }

  .custom-panel,
  .record-panel {
    max-height: none;
    height: 100%;
    overflow: auto;
  }

  .mobile-menu {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--mobile-menu-height);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 0;
    background: #ffffff;
    box-shadow: 0 -12px 24px rgba(15, 23, 42, 0.12);
  }

  .dock-item {
    border: none;
    background: #ffffff;
    border-radius: 0;
    padding: 6px 6px 4px;
    height: 100%;
    font-weight: 700;
    color: #6b7280;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .dock-item.active {
    background: #f3f4f6;
    color: #111827;
  }

  .dock-title {
    font-size: 13px;
    line-height: 1.1;
  }

  .dock-sub {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.1;
    color: #94a3b8;
  }

  .dock-sub.is-accent {
    color: #2563eb;
  }

  .dock-sub.is-progress {
    color: #16a34a;
  }

  .dock-item.active .dock-sub {
    color: #475569;
  }

  .dock-item.active .dock-sub.is-accent {
    color: #1d4ed8;
  }

  .dock-item.active .dock-sub.is-progress {
    color: #15803d;
  }

  .dock-item :deep(.p-ink) {
    background: rgba(0, 0, 0, 0.12);
  }

  .mode-tabs {
    padding-bottom: calc(var(--mobile-menu-height) + 30px);
  }
}
</style>
