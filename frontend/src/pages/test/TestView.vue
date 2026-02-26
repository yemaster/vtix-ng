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
import {
  getCachedProblemSetUpdatedAt,
  readCachedProblemSetDetail,
  writeCachedProblemSetDetail
} from '../../base/problemSetCache'
import PracticeProgress from '../../base/PracticeProgress'
import {
  getSyncAt,
  getSyncCursor,
  setSyncAt,
  setSyncCursor,
  syncRecords
} from '../../base/recordSync'
import {
  readPracticeRecordById,
  readPracticeRecords,
  upsertPracticeRecordsWithResult
} from '../../base/practiceRecords'
import { addWrongProblem, getWrongProblemsByTest } from '../../base/wrongProblems'
import {
  getStorageItem,
  getVtixStorage,
  isStorageAvailable,
  probeStorage,
  setStorageItem
} from '../../base/vtixGlobal'
import { useUserStore } from '../../stores/user'
import { formatRelativeTimeFromNow } from '../../utils/datetime'

type ProblemListType = {
  title: string
  test: TestConfigItem[] | number[] | number | null
  score?: number[]
  problems: ProblemType[]
}

type ProblemMetaPayload = {
  createdAt?: number
  updatedAt?: number
}

type ProblemDetailPayload = ProblemListType & {
  code?: string
  createdAt?: number
  updatedAt?: number
}

type TestConfigItem = {
  type: number
  typeMask?: number
  number: number
  score: number
}

type PracticeRecord = {
  id: string
  testId: string
  testTitle?: string
  updatedAt: number
  deletedAt?: number
  practiceMode: number
  progress: ReturnType<InstanceType<typeof PracticeProgress>['toJSON']>
  problemState: number[]
  errorProblems: ProblemType[]
  examQuestionScores?: number[]
  setType: [boolean, boolean, boolean, boolean, boolean]
  setShuffle: boolean
}

type IndexedPatchTuple<T> = [number, T]

type PracticeRecordDeltaPayload = {
  id: string
  updatedAt: number
  baseUpdatedAt?: number
  deletedAt?: number
  testTitle?: string
  practiceMode?: number
  setType?: [boolean, boolean, boolean, boolean, boolean]
  setShuffle?: boolean
  progress?: {
    currentProblemId?: number
    timeSpentSeconds?: number
    answerPatches?: IndexedPatchTuple<(number | string)[]>[]
  }
  problemStatePatches?: IndexedPatchTuple<number>[]
  errorProblemIndexes?: number[]
  examQuestionScorePatches?: IndexedPatchTuple<number>[]
  resetExamQuestionScores?: boolean
}

type CloudRecordSyncState = {
  checked: boolean
  recordExists: boolean
  deltaCount: number
  snapshot: PracticeRecord | null
}

type ExamNumberGroup = {
  key: string
  label: string
  score: number
  indices: number[]
}

const LOCAL_SYNC_KEY = 'vtixLastLocalSaveAt'
const CLOUD_SYNC_SNAPSHOT_INTERVAL = 24

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const testId = String(route.params.id || '')
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const loading = ref(true)
const loadError = ref('')
const needInvite = ref(false)
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '')
const inviteError = ref('')
const inviteSubmitting = ref(false)

const problemInfo = ref<ProblemListType>({
  title: '加载中',
  test: [],
  score: [0, 0, 0, 0, 0],
  problems: []
})

const testTitle = computed(() => problemInfo.value.title || '测试题库')

const viewMode = ref<'menu' | 'question' | 'list'>('question')
const isMobile = ref(false)
const BODY_HIDE_FOOTER_CLASS = 'test-view-mobile-footer-hidden'
let mediaQuery: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null

const modes = [
  { label: '顺序练习', value: 0 },
  { label: '乱序练习', value: 1 },
  { label: '自定义练习', value: 2 },
  { label: '模拟考试', value: 5 },
  { label: '错题回顾', value: 4 }
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
const localSyncErrorDetail = ref('')
const cloudSyncErrorDetail = ref('')
const canUseLocalStorage = ref(true)
const cloudSyncing = ref(false)
let cloudSyncTimer: number | null = null
let lastCloudSyncAttempt = 0
const cloudRecordState = new Map<string, CloudRecordSyncState>()

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
const wrongProblemsVersion = ref(0)

const currentProblem = computed(() => nowProblemList.value[nowProblemId.value])
const currentTypeLabel = computed(() => {
  const type = currentProblem.value?.type ?? 0
  return problemTypes[type] ?? '题目'
})

const isSubmitted = computed(() => (problemState.value[nowProblemId.value] ?? 0) >= 2)
const isSingleChoice = computed(
  () => currentProblem.value?.type === 1 || currentProblem.value?.type === 4
)
const isMultiChoice = computed(() => currentProblem.value?.type === 2)
const showFillAnswer = computed(
  () => currentProblem.value?.type === 3 && (problemState.value[nowProblemId.value] ?? 0) === 3
)
const fillAnswerText = computed(() => {
  if (!currentProblem.value || currentProblem.value.type !== 3) return ''
  return formatFillAnswer(currentProblem.value)
})
const examTypeOptions = [
  { label: '单选题', problemType: 1, mask: 1 },
  { label: '多选题', problemType: 2, mask: 2 },
  { label: '填空题', problemType: 3, mask: 4 },
  { label: '判断题', problemType: 4, mask: 8 }
] as const
const EXAM_TYPE_MASK_ALL = examTypeOptions.reduce((sum, item) => sum | item.mask, 0)
const cnNumbers = ['一', '二', '三', '四', '五', '六']
const DEFAULT_TEST_SCORES = [0, 1, 2, 1, 1]
const examQuestionScores = ref<number[]>([])
const examRuntimeGroups = ref<ExamNumberGroup[]>([])

function normalizeExamMaskValue(value: unknown) {
  const parsed = Math.floor(Number(value ?? 0))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed & EXAM_TYPE_MASK_ALL
}

function legacyProblemTypeToMask(type: number) {
  return examTypeOptions.find((item) => item.problemType === type)?.mask ?? 0
}

function resolveExamMaskFromConfigItem(item: unknown) {
  if (!item || typeof item !== 'object') return 0
  const row = item as Record<string, unknown>
  const rawMask = row.typeMask ?? row.mask
  if (rawMask !== undefined && rawMask !== null && rawMask !== '') {
    return normalizeExamMaskValue(rawMask)
  }
  const rawType = Math.floor(Number(row.type ?? -1))
  if (Number.isFinite(rawType) && rawType >= 1 && rawType <= 4) {
    return legacyProblemTypeToMask(rawType)
  }
  return normalizeExamMaskValue(rawType)
}

function decodeExamMask(mask: number) {
  return examTypeOptions
    .filter((item) => (mask & item.mask) === item.mask)
    .map((item) => item.problemType)
}

function getExamMaskLabel(mask: number) {
  const labels = examTypeOptions
    .filter((item) => (mask & item.mask) === item.mask)
    .map((item) => item.label)
  return labels.length ? labels.join(' / ') : '题目'
}

function normalizeTestConfig(rawTest: unknown, rawScore: unknown) {
  if (Array.isArray(rawTest)) {
    if (rawTest.every((item) => item && typeof item === 'object')) {
      const order: number[] = []
      const map = new Map<number, TestConfigItem>()
      rawTest.forEach((item) => {
        const type = resolveExamMaskFromConfigItem(item)
        if (type <= 0) return
        const number = Math.max(0, Math.floor(Number((item as any).number ?? 0)))
        if (number <= 0) return
        const score = Math.max(0, Number((item as any).score ?? 0))
        if (!map.has(type)) {
          order.push(type)
          map.set(type, { type, typeMask: type, number, score })
        } else {
          const existing = map.get(type)
          if (existing) {
            existing.number += number
            existing.score = score
          }
        }
      })
      return order.map((type) => map.get(type) as TestConfigItem).filter(Boolean)
    }
    if (rawTest.every((item) => typeof item === 'number')) {
      const scores = Array.isArray(rawScore) ? rawScore : DEFAULT_TEST_SCORES
      return examTypeOptions
        .map((item) => ({
          type: item.mask,
          typeMask: item.mask,
          number: Math.max(0, Math.floor(Number(rawTest[item.problemType] ?? 0))),
          score: Math.max(0, Number(scores[item.problemType] ?? 0))
        }))
        .filter((item) => item.number > 0)
    }
  }
  return []
}

const testConfig = computed(() => normalizeTestConfig(problemInfo.value.test, problemInfo.value.score))

function getScoreForProblemType(type: number) {
  const typeMask = legacyProblemTypeToMask(type)
  if (typeMask > 0) {
    const row = testConfig.value.find((item) => (item.type & typeMask) === typeMask)
    if (row) return row.score
  }
  return Math.max(0, Number(DEFAULT_TEST_SCORES[type] ?? 0))
}

function scoreForExamIndex(index: number, problem: ProblemType) {
  if (index >= 0 && index < examQuestionScores.value.length) {
    return Math.max(0, Number(examQuestionScores.value[index] ?? 0))
  }
  return getScoreForProblemType(problem.type)
}

function buildFallbackExamGroups(problemList: ProblemType[]) {
  const groups = new Map<number, ExamNumberGroup>()
  problemList.forEach((problem, index) => {
    const key = problem.type
    if (!groups.has(key)) {
      groups.set(key, {
        key: `type-${key}`,
        label: problemTypes[key] ?? '题目',
        score: getScoreForProblemType(key),
        indices: []
      })
    }
    groups.get(key)?.indices.push(index)
  })
  return Array.from(groups.values()).filter((group) => group.indices.length > 0)
}

const examNumberGroups = computed(() => {
  if (!isExamMode.value) return []
  const list = nowProblemList.value
  if (!list.length) return []
  const runtime = examRuntimeGroups.value
  const canUseRuntime =
    runtime.length > 0 &&
    runtime.every((group) => group.indices.every((index) => index >= 0 && index < list.length))
  if (canUseRuntime) {
    return runtime.filter((group) => group.indices.length > 0)
  }
  return buildFallbackExamGroups(list)
})

const examMaxScore = computed(() => {
  if (!nowProblemList.value.length) return 0
  return nowProblemList.value.reduce((sum, problem, index) => sum + scoreForExamIndex(index, problem), 0)
})

const examScore = computed(() => {
  if (!nowProblemList.value.length) return 0
  return nowProblemList.value.reduce((sum, problem, index) => {
    if (problemState.value[index] === 2) {
      return sum + scoreForExamIndex(index, problem)
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

const wrongReviewAvailable = computed(() => {
  wrongProblemsVersion.value
  const stored = getWrongProblemsByTest(currentUserId.value, testId)
  if (stored.length > 0) return true
  return errorProblems.value.length > 0
})

const tabItems = computed(() => [
  ...modes.map((mode) => ({
    label: mode.label,
    disabled: mode.value === 4 && !wrongReviewAvailable.value,
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
    disabled: mode.value === 4 && !wrongReviewAvailable.value,
    command: () => handleModeClick(mode.value)
  })),
  {
    separator: true
  },
  {
    label: '问题反馈',
    command: () => {
      router.push({ name: 'help' })
    }
  },
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
let nextProblemTimer: number | null = null
const NEXT_PROBLEM_DELAY_MS = 350

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

function formatSyncAgo(timestamp: number | null | undefined) {
  if (!timestamp) return '未同步'
  return `${formatRelativeTimeFromNow(timestamp)}同步`
}

function toErrorMessage(error: unknown, fallback = '未知错误') {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

async function readResponseErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim()
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim()
    const text = JSON.stringify(payload)
    if (text && text !== '{}') return text
  } catch {
    try {
      const text = (await response.text()).trim()
      if (text) return text
    } catch {
      // ignore
    }
  }
  return fallback
}

const localSyncFailed = computed(() => !canUseLocalStorage.value || Boolean(localSyncErrorDetail.value))
const localSyncSucceeded = computed(() => canUseLocalStorage.value && !localSyncFailed.value && Boolean(localSaveAt.value))

const syncStatusLabel = computed(() => {
  if (userStore.user) {
    if (cloudSyncFailed.value) {
      return localSyncSucceeded.value ? '本地已同步' : '同步失败'
    }
    if (cloudSyncAt.value) return '云端已同步'
    if (localSyncFailed.value) return '同步失败'
    return '未同步'
  }
  if (localSyncSucceeded.value) return '本地已同步'
  if (localSyncFailed.value) return '同步失败'
  return '未同步'
})

const syncStatusTooltip = computed(() => {
  syncTick.value
  const localLine = localSyncFailed.value
    ? `本地：失败（${localSyncErrorDetail.value || '未知错误'}）`
    : `本地：${formatSyncAgo(localSaveAt.value)}`

  if (userStore.user) {
    const cloudLine = cloudSyncFailed.value
      ? `云端：失败（${cloudSyncErrorDetail.value || '未知错误'}）`
      : cloudSyncAt.value
      ? `云端：${formatSyncAgo(cloudSyncAt.value)}`
      : '云端：未同步'
    return `${cloudLine}\n${localLine}`
  }
  return localLine
})

const syncAgoText = computed(() => {
  syncTick.value
  if (!canUseLocalStorage.value) return '存储不可用'
  if (userStore.user) {
    if (cloudSyncFailed.value) return '云端同步失败'
    if (!cloudSyncAt.value) return '未同步'
    const distance = formatRelativeTimeFromNow(cloudSyncAt.value)
    return `${distance}同步`
  }
  if (!localSaveAt.value) return '未同步'
  const distance = formatRelativeTimeFromNow(localSaveAt.value)
  return `${distance}同步`
})

const syncStatusSeverity = computed(() => {
  if (syncStatusLabel.value === '同步失败') return 'danger'
  if (userStore.user && cloudSyncFailed.value) return 'danger'
  if (syncStatusLabel.value === '未同步') return 'secondary'
  return 'success'
})

const syncStatusTooltipOptions = computed(() => ({
  value: syncStatusTooltip.value,
  class: 'sync-status-tooltip'
}))

const syncTick = ref(0)

const mobileMenuItems = [
  { label: '模式选择', value: 'menu' as const },
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

const TITLE_SUFFIX = ' - vtix 大题'

function setTitle(title: string) {
  const base = title.trim()
  document.title = base ? `${base}${TITLE_SUFFIX}` : `VTIX${TITLE_SUFFIX}`
}

function syncFooterVisibility() {
  if (typeof document === 'undefined') return
  document.body.classList.toggle(BODY_HIDE_FOOTER_CLASS, isMobile.value)
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
    event.preventDefault()
    event.stopPropagation()
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

type RecordReadOptions = { includeDeleted?: boolean }

function isDeletedRecord(record: PracticeRecord) {
  return typeof (record as { deletedAt?: unknown }).deletedAt === 'number' &&
    Number((record as { deletedAt?: number }).deletedAt ?? 0) > 0
}

function readRecords(options: RecordReadOptions = {}): PracticeRecord[] {
  const list = readPracticeRecords<PracticeRecord>({ includeDeleted: options.includeDeleted })
  return options.includeDeleted ? list : list.filter((item) => !isDeletedRecord(item))
}

function describeLocalWriteFailure(result: {
  failures: Array<{ id: string; reason: string }>
  indexError: string | null
}) {
  const parts: string[] = []
  if (result.failures.length > 0) {
    const first = result.failures[0]
    if (first) {
      parts.push(`记录 ${first.id} 写入失败：${first.reason}`)
    } else {
      parts.push(`有 ${result.failures.length} 条记录写入失败`)
    }
  }
  if (result.indexError) {
    parts.push(`索引写入失败：${result.indexError}`)
  }
  return parts.join('；')
}

function writeRecords(records: PracticeRecord[]) {
  if (!canUseLocalStorage.value) {
    localSyncErrorDetail.value = '本地存储不可用或被禁用'
    return false
  }
  const result = upsertPracticeRecordsWithResult(records)
  const writeError = describeLocalWriteFailure(result)
  if (writeError) {
    localSyncErrorDetail.value = writeError
    return false
  }
  const now = Date.now()
  if (!setStorageItem(LOCAL_SYNC_KEY, String(now))) {
    localSyncErrorDetail.value = '同步时间戳写入失败'
    return false
  }
  localSaveAt.value = now
  localSyncErrorDetail.value = ''
  return true
}

function applyCloudRecords(records: PracticeRecord[]) {
  if (!records.length) return true
  const result = upsertPracticeRecordsWithResult(records)
  const writeError = describeLocalWriteFailure(result)
  if (writeError) {
    localSyncErrorDetail.value = `云端数据回写失败：${writeError}`
    return false
  }
  localSyncErrorDetail.value = ''
  return true
}

function syncLocalRecords() {
  savedRecords.value = readRecords()
}

function loadLocalSyncTime() {
  canUseLocalStorage.value = isStorageAvailable() && probeStorage()
  if (!canUseLocalStorage.value) {
    localSaveAt.value = null
    cloudSyncAt.value = null
    localSyncErrorDetail.value = '本地存储不可用或被禁用'
    return
  }
  localSyncErrorDetail.value = ''
  const raw = Number(getStorageItem(LOCAL_SYNC_KEY))
  localSaveAt.value = Number.isFinite(raw) && raw > 0 ? raw : null
  const cloudRaw = getSyncAt(getVtixStorage(), userStore.user?.id ?? '')
  cloudSyncAt.value = Number.isFinite(cloudRaw) && cloudRaw > 0 ? cloudRaw : null
}


function getCloudRecordSyncState(recordId: string) {
  const cached = cloudRecordState.get(recordId)
  if (cached) return cached
  const next: CloudRecordSyncState = {
    checked: false,
    recordExists: false,
    deltaCount: 0,
    snapshot: null
  }
  cloudRecordState.set(recordId, next)
  return next
}

async function checkCloudRecordExists(recordId: string) {
  const response = await fetch(`${apiBase}/api/records/meta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids: [recordId] })
  })
  if (!response.ok) {
    const detail = await readResponseErrorMessage(response, `状态码 ${response.status}`)
    throw new Error(`检查记录失败：${detail}`)
  }
  const data = (await response.json()) as { ids?: string[] }
  const ids = Array.isArray(data.ids) ? data.ids : []
  return ids.includes(recordId)
}

function isSameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function buildIndexedPatches<T>(
  prev: T[],
  next: T[],
  equal: (a: T | undefined, b: T | undefined) => boolean
) {
  const patches: IndexedPatchTuple<T>[] = []
  const total = Math.max(prev.length, next.length)
  for (let index = 0; index < total; index += 1) {
    const prevValue = prev[index]
    const nextValue = next[index]
    if (equal(prevValue, nextValue)) continue
    if (nextValue === undefined) continue
    patches.push([index, deepCopy(nextValue)])
  }
  return patches
}

function collectWrongIndexes(problemState: number[]) {
  const indexes: number[] = []
  for (let index = 0; index < problemState.length; index += 1) {
    if (problemState[index] === 3) {
      indexes.push(index)
    }
  }
  return indexes
}

function buildRecordDeltaPayload(prev: PracticeRecord, next: PracticeRecord) {
  if (prev.id !== next.id) return null
  const payload: PracticeRecordDeltaPayload = {
    id: next.id,
    updatedAt: next.updatedAt,
    baseUpdatedAt: prev.updatedAt
  }
  let changed = false

  if (next.deletedAt && next.deletedAt > 0) {
    payload.deletedAt = next.deletedAt
    changed = true
  }
  if (prev.testTitle !== next.testTitle) {
    payload.testTitle = next.testTitle
    changed = true
  }
  if (prev.practiceMode !== next.practiceMode) {
    payload.practiceMode = next.practiceMode
    changed = true
  }
  if (!isSameJson(prev.setType, next.setType)) {
    payload.setType = [...next.setType] as [boolean, boolean, boolean, boolean, boolean]
    changed = true
  }
  if (prev.setShuffle !== next.setShuffle) {
    payload.setShuffle = next.setShuffle
    changed = true
  }

  const progressPayload: NonNullable<PracticeRecordDeltaPayload['progress']> = {}
  if (prev.progress.currentProblemId !== next.progress.currentProblemId) {
    progressPayload.currentProblemId = next.progress.currentProblemId
    changed = true
  }
  if (prev.progress.timeSpentSeconds !== next.progress.timeSpentSeconds) {
    progressPayload.timeSpentSeconds = next.progress.timeSpentSeconds
    changed = true
  }
  const answerPatches = buildIndexedPatches(
    prev.progress.answerList ?? [],
    next.progress.answerList ?? [],
    (left, right) => isSameJson(left, right)
  )
  if (answerPatches.length > 0) {
    progressPayload.answerPatches = answerPatches
    changed = true
  }
  if (Object.keys(progressPayload).length > 0) {
    payload.progress = progressPayload
  }

  const problemStatePatches = buildIndexedPatches(
    prev.problemState ?? [],
    next.problemState ?? [],
    (left, right) => left === right
  )
  if (problemStatePatches.length > 0) {
    payload.problemStatePatches = problemStatePatches
    changed = true
  }

  const prevWrongIndexes = collectWrongIndexes(prev.problemState ?? [])
  const nextWrongIndexes = collectWrongIndexes(next.problemState ?? [])
  if (!isSameJson(prevWrongIndexes, nextWrongIndexes)) {
    payload.errorProblemIndexes = nextWrongIndexes
    changed = true
  }

  const prevExamScores = Array.isArray(prev.examQuestionScores) ? prev.examQuestionScores : []
  const nextExamScores = Array.isArray(next.examQuestionScores) ? next.examQuestionScores : []
  if (prevExamScores.length > 0 && nextExamScores.length === 0) {
    payload.resetExamQuestionScores = true
    changed = true
  } else {
    const examQuestionScorePatches = buildIndexedPatches(
      prevExamScores,
      nextExamScores,
      (left, right) => Number(left ?? NaN) === Number(right ?? NaN)
    )
    if (examQuestionScorePatches.length > 0) {
      payload.examQuestionScorePatches = examQuestionScorePatches
      changed = true
    }
  }

  if (!changed) return null
  return payload
}

async function syncCloudRecordsFull(options: { bypassThrottle?: boolean } = {}) {
  if (!userStore.user) return
  if (!canUseLocalStorage.value) return
  if (cloudSyncing.value) return
  const now = Date.now()
  if (!options.bypassThrottle && now - lastCloudSyncAttempt < 4000) return
  lastCloudSyncAttempt = now
  cloudSyncing.value = true
  try {
    const storage = getVtixStorage()
    if (!storage) return
    const syncScope = userStore.user?.id ?? ''
    const syncStartedAt = Date.now()
    const localRecords = readRecords({ includeDeleted: true })
    const previousCursor = getSyncCursor(storage, syncScope)
    const since = localRecords.length ? previousCursor : 0
    const localSince = getSyncAt(storage, syncScope)
    const maxRecords = Number.isFinite(Number(userStore.user?.recordCloudLimit))
      ? Number(userStore.user?.recordCloudLimit)
      : undefined
    const result = await syncRecords<PracticeRecord>({
      apiBase,
      localRecords,
      since,
      localSince,
      credentials: 'include',
      maxRecords,
      trimLocal: false
    })
    applyCloudRecords(result.remoteRecords)
    syncLocalRecords()
    cloudSyncFailed.value = false
    cloudSyncErrorDetail.value = ''
    setSyncCursor(storage, result.cursor, syncScope)
    cloudSyncAt.value = Date.now()
    setSyncAt(storage, syncStartedAt, syncScope)
    if (progressId.value) {
      const current = readPracticeRecordById<PracticeRecord>(progressId.value)
      if (current && current.testId === testId) {
        const state = getCloudRecordSyncState(current.id)
        state.checked = true
        state.recordExists = true
        state.deltaCount = 0
        state.snapshot = deepCopy(normalizeRecord(current))
      }
    }
  } catch (error) {
    cloudSyncFailed.value = true
    cloudSyncErrorDetail.value = toErrorMessage(error, '云端同步失败')
  } finally {
    cloudSyncing.value = false
  }
}

async function syncCloudRecords(options: { forceSnapshot?: boolean; bypassThrottle?: boolean } = {}) {
  if (!userStore.user) return
  if (!canUseLocalStorage.value) return
  if (cloudSyncing.value) return
  const storage = getVtixStorage()
  if (!storage) return
  const syncScope = userStore.user?.id ?? ''
  const activeId = progressId.value
  if (!activeId) return
  const activeRecord = readPracticeRecordById<PracticeRecord>(activeId)
  if (!activeRecord || activeRecord.testId !== testId) return

  const normalizedRecord = normalizeRecord(activeRecord)
  const syncState = getCloudRecordSyncState(normalizedRecord.id)
  const now = Date.now()
  if (!options.bypassThrottle && now - lastCloudSyncAttempt < 4000) return
  lastCloudSyncAttempt = now
  const syncStartedAt = now
  cloudSyncing.value = true
  try {
    if (!syncState.checked) {
      syncState.recordExists = await checkCloudRecordExists(normalizedRecord.id)
      syncState.checked = true
    }
    const previousCursor = getSyncCursor(storage, syncScope)
    let shouldSnapshot = Boolean(options.forceSnapshot) ||
      !syncState.recordExists ||
      !syncState.snapshot ||
      syncState.deltaCount >= CLOUD_SYNC_SNAPSHOT_INTERVAL

    let payload: Record<string, unknown> = {
      since: previousCursor,
      recordId: normalizedRecord.id
    }
    if (shouldSnapshot) {
      payload.fullRecord = normalizedRecord
    } else {
      const delta = buildRecordDeltaPayload(syncState.snapshot as PracticeRecord, normalizedRecord)
      if (!delta) {
        cloudSyncFailed.value = false
        cloudSyncErrorDetail.value = ''
        return
      } else {
        payload.delta = delta
      }
    }

    let response = await fetch(`${apiBase}/api/records/sync-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const detail = await readResponseErrorMessage(response, `状态码 ${response.status}`)
      throw new Error(`同步失败：${detail}`)
    }
    let data = (await response.json()) as {
      needFull?: boolean
      recordExists?: boolean
      conflict?: boolean
      noOp?: boolean
      cursor?: number
      updatedAt?: number
      trimmed?: number
      limit?: number
      records?: PracticeRecord[]
      record?: PracticeRecord
    }

    if (data.needFull && !('fullRecord' in payload)) {
      payload = {
        since: previousCursor,
        recordId: normalizedRecord.id,
        fullRecord: normalizedRecord
      }
      response = await fetch(`${apiBase}/api/records/sync-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        const detail = await readResponseErrorMessage(response, `状态码 ${response.status}`)
        throw new Error(`同步失败：${detail}`)
      }
      data = (await response.json()) as typeof data
    }
    if (data.needFull) {
      syncState.recordExists = false
      syncState.snapshot = null
      throw new Error('服务器要求全量同步')
    }

    let remoteApplied = false
    if (Array.isArray(data.records) && data.records.length > 0) {
      if (!applyCloudRecords(data.records)) {
        throw new Error('云端数据回写失败')
      }
      remoteApplied = true
    } else if (data.record && data.record.id) {
      if (!applyCloudRecords([data.record])) {
        throw new Error('云端数据回写失败')
      }
      remoteApplied = true
    }
    if (remoteApplied) {
      syncLocalRecords()
    }

    const cursor =
      typeof data.cursor === 'number' && Number.isFinite(data.cursor)
        ? Math.floor(data.cursor)
        : previousCursor
    setSyncCursor(storage, cursor, syncScope)
    cloudSyncAt.value = Date.now()
    setSyncAt(storage, syncStartedAt, syncScope)
    cloudSyncFailed.value = false
    cloudSyncErrorDetail.value = ''

    const latest = remoteApplied
      ? readPracticeRecordById<PracticeRecord>(normalizedRecord.id) ?? normalizedRecord
      : normalizedRecord
    syncState.snapshot = deepCopy(normalizeRecord(latest))
    syncState.checked = true
    syncState.recordExists = true
    syncState.deltaCount = shouldSnapshot ? 0 : Math.min(syncState.deltaCount + 1, CLOUD_SYNC_SNAPSHOT_INTERVAL)
  } catch (error) {
    cloudSyncFailed.value = true
    cloudSyncErrorDetail.value = toErrorMessage(error, '云端同步失败')
  } finally {
    cloudSyncing.value = false
  }
}

function scheduleCloudSync(delay = 1200, mode: 'incremental' | 'full' = 'incremental') {
  if (!userStore.user) return
  if (!canUseLocalStorage.value) return
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
  }
  cloudSyncTimer = window.setTimeout(() => {
    if (mode === 'full') {
      void syncCloudRecordsFull()
      return
    }
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
    const valueI = copy[i]
    const valueJ = copy[j]
    if (valueI === undefined || valueJ === undefined) continue
    copy[i] = valueJ
    copy[j] = valueI
  }
  return copy
}

function shuffleProblemChoices(problem: ProblemType): ProblemType {
  if (problem.type === 3) return problem
  const choicesList = [...problem.choices]
  const indices = choicesList.map((_, index) => index)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const valueI = indices[i]
    const valueJ = indices[j]
    if (valueI === undefined || valueJ === undefined) continue
    indices[i] = valueJ
    indices[j] = valueI
  }
  const newChoices = indices.map((index) => choicesList[index]!)
  if (problem.type === 2) {
    const newAnswer = problem.answer.map((answer) => indices.indexOf(answer)).sort((a, b) => a - b)
    return {
      type: 2,
      content: problem.content,
      choices: newChoices,
      answer: newAnswer,
      hint: problem.hint
    }
  }
  const newAnswer = indices.indexOf(problem.answer)
  if (problem.type === 4) {
    return {
      type: 4,
      content: problem.content,
      choices: [newChoices[0]!, newChoices[1]!],
      answer: newAnswer,
      hint: problem.hint
    }
  }
  return {
    type: 1,
    content: problem.content,
    choices: newChoices,
    answer: newAnswer,
    hint: problem.hint
  }
}

function buildRandomizedList(list: ProblemType[]) {
  const copy = deepCopy(list).map((problem) => shuffleProblemChoices(problem))
  return shuffleList(copy)
}

function applyExamRuntime(problemList: ProblemType[], scores: number[] = [], groups: ExamNumberGroup[] = []) {
  if (!problemList.length) {
    examQuestionScores.value = []
    examRuntimeGroups.value = []
    return
  }
  const fallbackScores = problemList.map((problem) => getScoreForProblemType(problem.type))
  examQuestionScores.value =
    scores.length === problemList.length ? [...scores] : fallbackScores
  if (groups.length > 0) {
    examRuntimeGroups.value = groups
      .filter((group) => group.indices.length > 0)
      .map((group) => ({
        ...group,
        indices: group.indices.filter((index) => index >= 0 && index < problemList.length)
      }))
      .filter((group) => group.indices.length > 0)
    if (examRuntimeGroups.value.length > 0) return
  }
  examRuntimeGroups.value = buildFallbackExamGroups(problemList)
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
  if (mode === 5) {
    const hasRuntime =
      examQuestionScores.value.length === problemList.length &&
      examRuntimeGroups.value.length > 0
    if (!hasRuntime) {
      applyExamRuntime(problemList)
    }
  } else {
    examQuestionScores.value = []
    examRuntimeGroups.value = []
  }
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
  const examQuestionScores =
    Array.isArray((record as { examQuestionScores?: unknown }).examQuestionScores) &&
    (record as { examQuestionScores?: unknown[] }).examQuestionScores?.length === list.length
      ? (record as { examQuestionScores?: unknown[] }).examQuestionScores
          ?.map((value) => Math.max(0, Number(value ?? 0)))
          .filter((value): value is number => Number.isFinite(value))
      : undefined
  return {
    ...record,
    progress: {
      ...record.progress,
      problemList: list,
      answerList,
      submittedList,
      currentProblemId
    },
    problemState,
    ...(examQuestionScores && examQuestionScores.length === list.length ? { examQuestionScores } : {})
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
  if (practiceMode.value === 5) {
    applyExamRuntime(data.problemList, normalized.examQuestionScores ?? [])
  } else {
    examQuestionScores.value = []
    examRuntimeGroups.value = []
  }
}

function saveCurrentRecord() {
  if (!progress.value || !canUseLocalStorage.value) return
  if (!hasEverInteracted.value || !hasDirty.value) return
  const previousLocalRecord = progressId.value
    ? readPracticeRecordById<PracticeRecord>(progressId.value)
    : null
  if (!progressId.value) {
    progressId.value = generateProgressId()
  }
  progressUpdatedAt.value = Date.now()
  const currentList = progress.value.problemList ?? []
  const normalizedErrors = collectWrongIndexes(problemState.value)
    .map((index) => currentList[index])
    .filter((problem): problem is ProblemType => Boolean(problem))
  errorProblems.value = normalizedErrors
  const record: PracticeRecord = {
    id: progressId.value,
    testId,
    testTitle: testTitle.value,
    updatedAt: progressUpdatedAt.value,
    practiceMode: practiceMode.value,
    progress: progress.value.toJSON(),
    problemState: [...problemState.value],
    errorProblems: deepCopy(normalizedErrors),
    ...(practiceMode.value === 5 && examQuestionScores.value.length === progress.value.problemList.length
      ? { examQuestionScores: [...examQuestionScores.value] }
      : {}),
    setType: [...setType.value] as [boolean, boolean, boolean, boolean, boolean],
    setShuffle: setShuffle.value
  }
  const writeOk = writeRecords([record])
  if (!writeOk) {
    hasDirty.value = true
    return
  }
  const syncState = getCloudRecordSyncState(record.id)
  if (!syncState.snapshot && previousLocalRecord && previousLocalRecord.id === record.id) {
    syncState.snapshot = deepCopy(normalizeRecord(previousLocalRecord))
  }
  savedRecords.value = readRecords()
  hasDirty.value = false
  scheduleCloudSync()
}

function deleteRecord(recordId: string) {
  const now = Date.now()
  const deleted = { id: recordId, updatedAt: now, deletedAt: now } as PracticeRecord
  const writeOk = writeRecords([deleted])
  savedRecords.value = readRecords()
  if (writeOk) {
    scheduleCloudSync(300, 'full')
  }
}

function loadRecord(recordId: string) {
  const record = readPracticeRecordById<PracticeRecord>(recordId) ?? null
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
    ...(Array.isArray(raw.examQuestionScores)
      ? {
          examQuestionScores: raw.examQuestionScores
            .map((value: unknown) => Math.max(0, Number(value ?? 0)))
            .filter((value: number) => Number.isFinite(value))
        }
      : {}),
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
    writeRecords(incoming)
    savedRecords.value = readRecords()
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
  const latest = records[0]
  if (!latest) return false
  applyRecord(latest)
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
    missed: !selected && correct,
    incorrect: !correct
  }
}

function setMode(mode: number) {
  saveCurrentRecord()
  if (mode === 4 && !wrongReviewAvailable.value) {
    return
  }
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
  if (testConfig.value.length) {
    const used = new Set<number>()
    const list: ProblemType[] = []
    const scores: number[] = []
    const groups: ExamNumberGroup[] = []
    testConfig.value.forEach((item, rowIndex) => {
      const count = Math.max(0, Math.floor(Number(item.number ?? 0)))
      if (count <= 0) return
      const mask = normalizeExamMaskValue(item.typeMask ?? item.type)
      const allowedTypes = decodeExamMask(mask)
      if (!allowedTypes.length) return
      const allowedSet = new Set(allowedTypes)
      const score = Math.max(0, Number(item.score ?? 0))
      const group: ExamNumberGroup = {
        key: `mask-${mask}-${rowIndex}`,
        label: getExamMaskLabel(mask),
        score,
        indices: []
      }
      for (let index = 0; index < base.length && group.indices.length < count; index += 1) {
        if (used.has(index)) continue
        const problem = base[index]
        if (!problem || !allowedSet.has(problem.type)) continue
        used.add(index)
        list.push(problem)
        scores.push(score)
        group.indices.push(list.length - 1)
      }
      if (group.indices.length > 0) {
        groups.push(group)
      }
    })
    if (list.length) {
      applyExamRuntime(list, scores, groups)
      return list
    }
  }
  if (typeof meta === 'number' && Number.isFinite(meta)) {
    const list = base.slice(0, Math.min(meta, base.length))
    applyExamRuntime(list)
    return list
  }
  applyExamRuntime(base)
  return base
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
        const answerPart = answers[i] ?? ''
        const userPart = userParts[i] ?? ''
        const allowed = answerPart.split(';').map((v) => v.trim())
        if (!allowed.includes(userPart)) {
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
      wrongProblemsVersion.value += 1
    }
    progress.value?.markSubmitted(nowProblemId.value)
  }

function formatFillAnswer(problem: ProblemType) {
  if (problem.type !== 3) return ''
  return problem.answer
    .split(',')
    .map((part: string) =>
      part
        .split(';')
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0)
        .join(' / ')
    )
    .filter((value: string) => value.length > 0)
    .join(' ，')
}

function isFillAnswerCorrect(problem: ProblemType, rawAnswer: string) {
  if (problem.type !== 3) return false
  const normalized = normalizeFill(rawAnswer)
  const userParts = normalized.split(',').map((value: string) => value.trim())
  const answers = problem.answer.split(',').map((value: string) => value.trim())
  if (userParts.length !== answers.length) return false
  for (let i = 0; i < answers.length; i += 1) {
    const answerPart = answers[i] ?? ''
    const userPart = userParts[i] ?? ''
    const allowed = answerPart.split(';').map((value: string) => value.trim())
    if (!allowed.includes(userPart)) {
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
    if (!problem) continue
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
        wrongProblemsVersion.value += 1
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
    const targetIndex = nowProblemId.value
    if (nextProblemTimer !== null) {
      window.clearTimeout(nextProblemTimer)
    }
    nextProblemTimer = window.setTimeout(() => {
      nextProblemTimer = null
      if (nowProblemId.value !== targetIndex) return
      if (problemState.value[targetIndex] !== 2) return
      if (targetIndex + 1 >= nowProblemList.value.length) return
      nowProblemId.value = targetIndex + 1
    }, NEXT_PROBLEM_DELAY_MS)
  }
  saveCurrentRecord()
}

function handleModeClick(mode: number) {
  if (mode === 4 && !wrongReviewAvailable.value) {
    return
  }
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

function restartCurrentMode() {
  showRecords.value = false
  if (practiceMode.value === 2) {
    startCustomPractice()
    return
  }
  setMode(practiceMode.value)
}

function handleFillInput() {
  if (!currentProblem.value || currentProblem.value.type !== 3) return
  if (isSubmitted.value) return
  nowAnswer.value = [writeAnswer.value]
  markInteraction()
}

// records are handled via saveCurrentRecord/loadLatestRecord

function getPayloadUpdatedAt(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 0
  const row = payload as Record<string, unknown>
  const updatedAt = Number(row.updatedAt ?? row.createdAt ?? 0)
  return Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
}

function isProblemPayload(payload: unknown): payload is ProblemListType {
  if (!payload || typeof payload !== 'object') return false
  const row = payload as Record<string, unknown>
  return typeof row.title === 'string' && Array.isArray(row.problems)
}

async function fetchProblemDetail(invite: string) {
  const inviteParam = invite ? `?invite=${encodeURIComponent(invite)}` : ''
  const response = await fetch(`${apiBase}/api/problem-sets/${testId}${inviteParam}`)
  if (response.status === 403) {
    needInvite.value = true
    inviteError.value = invite ? '邀请码无效或已过期' : '该题库需要邀请码'
    return null
  }
  if (!response.ok) {
    throw new Error(`加载失败: ${response.status}`)
  }
  const data = (await response.json()) as ProblemDetailPayload
  if (!isProblemPayload(data)) {
    throw new Error('题库数据异常')
  }
  return data
}

function applyProblemPayload(data: ProblemListType) {
  problemInfo.value = data
  loading.value = false
  needInvite.value = false
  inviteError.value = ''
  syncLocalRecords()
  const recordId = typeof route.query.record === 'string' ? route.query.record : ''
  if (recordId && loadRecord(recordId)) {
    return
  }
  if (loadLatestRecord()) {
    return
  }
  setMode(0)
}

async function loadProblem() {
  loading.value = true
  loadError.value = ''
  const invite = inviteCode.value.trim()
  const cached = readCachedProblemSetDetail<ProblemDetailPayload>(testId)
  if (isProblemPayload(cached)) {
    const localUpdatedAt = Math.max(
      getCachedProblemSetUpdatedAt(testId),
      getPayloadUpdatedAt(cached)
    )
    try {
      const inviteParam = invite ? `?invite=${encodeURIComponent(invite)}` : ''
      const metaResponse = await fetch(`${apiBase}/api/problem-sets/${testId}/meta${inviteParam}`)
      if (metaResponse.status === 403) {
        needInvite.value = true
        inviteError.value = invite ? '邀请码无效或已过期' : '该题库需要邀请码'
        loading.value = false
        return
      }
      if (!metaResponse.ok) {
        throw new Error(`版本检查失败: ${metaResponse.status}`)
      }
      const meta = (await metaResponse.json()) as ProblemMetaPayload
      const remoteUpdatedAt = getPayloadUpdatedAt(meta)
      if (remoteUpdatedAt > localUpdatedAt) {
        const fresh = await fetchProblemDetail(invite)
        if (!fresh) {
          loading.value = false
          return
        }
        writeCachedProblemSetDetail(fresh)
        applyProblemPayload(fresh)
        return
      }
      applyProblemPayload(cached)
      return
    } catch {
      applyProblemPayload(cached)
      return
    }
  }

  try {
    const fresh = await fetchProblemDetail(invite)
    if (!fresh) {
      loading.value = false
      return
    }
    writeCachedProblemSetDetail(fresh)
    applyProblemPayload(fresh)
  } catch (error) {
    loading.value = false
    loadError.value = error instanceof Error ? error.message : '加载失败'
    router.replace({
      name: 'error',
      query: {
        code: '404',
        reason: '题库不存在',
        message: `未找到题库：${testId}`
      }
    })
  }
}

async function submitInvite() {
  if (!inviteCode.value.trim()) {
    inviteError.value = '请输入邀请码'
    return
  }
  if (inviteSubmitting.value) return
  inviteSubmitting.value = true
  inviteError.value = ''
  try {
    await loadProblem()
  } finally {
    inviteSubmitting.value = false
  }
}

onMounted(() => {
  setTitle(testTitle.value)
  loadLocalSyncTime()
  if (userStore.user) {
    scheduleCloudSync(300, 'full')
  }
  mediaQuery = window.matchMedia('(max-width: 900px)')
  mediaHandler = () => {
    if (mediaQuery) {
      isMobile.value = mediaQuery.matches
      syncFooterVisibility()
    }
  }
  mediaHandler()
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', mediaHandler)
  } else {
    mediaQuery.addListener(mediaHandler)
  }
    window.addEventListener('keydown', handleKeydown, true)
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
  if (typeof document !== 'undefined') {
    document.body.classList.remove(BODY_HIDE_FOOTER_CLASS)
  }
    window.removeEventListener('keydown', handleKeydown, true)
  stopTimer()
  if (syncTickerId !== null) {
    window.clearInterval(syncTickerId)
    syncTickerId = null
  }
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
  if (nextProblemTimer !== null) {
    window.clearTimeout(nextProblemTimer)
    nextProblemTimer = null
  }
  saveCurrentRecord()
  void syncCloudRecordsFull({ bypassThrottle: true })
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
})

onBeforeRouteLeave(() => {
  saveCurrentRecord()
  void syncCloudRecordsFull({ bypassThrottle: true })
  if (cloudSyncTimer !== null) {
    window.clearTimeout(cloudSyncTimer)
    cloudSyncTimer = null
  }
})

watch(
  () => userStore.user?.id,
  (value) => {
    cloudRecordState.clear()
    if (value) {
      scheduleCloudSync(300, 'full')
      return
    }
    cloudSyncFailed.value = false
    cloudSyncErrorDetail.value = ''
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

    <div v-if="loading" class="loading-panel" aria-live="polite" aria-busy="true">
      <div class="loading-card">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-title">正在加载题库…</div>
        <div class="loading-sub">请稍候，题目内容即将呈现</div>
        <div class="loading-skeleton">
          <span class="loading-line wide"></span>
          <span class="loading-line"></span>
          <span class="loading-line"></span>
        </div>
      </div>
    </div>

    <template v-else>
      <section v-if="needInvite" class="invite-panel">
        <div class="invite-card">
          <div class="invite-title">该题库需要邀请码</div>
          <p class="invite-desc">请输入创建人提供的邀请码后继续查看题目内容。</p>
          <div class="invite-input">
            <InputText v-model="inviteCode" placeholder="输入邀请码" />
            <Button label="验证并进入" :loading="inviteSubmitting" @click="submitInvite" />
          </div>
          <div v-if="inviteError" class="invite-error">{{ inviteError }}</div>
        </div>
      </section>

      <template v-else>
        <div class="mode-tabs" v-show="!isMobile || (viewMode === 'menu' && !showRecords)">
          <div v-show="!isMobile">
            <TabMenu :model="tabItems" :activeIndex="activeTabIndex" @tab-change="handleTabChange" />
          </div>
          <div v-show="isMobile">
            <Menu :model="menuItems" class="mobile-mode-menu" />
          </div>
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
            <div class="sync-tag">
              <Tag
                :value="syncStatusLabel"
                :severity="syncStatusSeverity"
                rounded
                v-tooltip.bottom="syncStatusTooltipOptions"
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
          <Button v-if="!isSingleChoice" type="button" label="提交" @click="submitAnswer" />
          <Button type="button" label="上一题" severity="secondary" :disabled="nowProblemId === 0"
            @click="nowProblemId -= 1" />
          <Button type="button" label="下一题" severity="secondary" :disabled="nowProblemId + 1 >= nowProblemList.length"
            @click="nowProblemId += 1" />
          <Button v-if="isExamMode" type="button" label="交卷" severity="success" :disabled="examSubmitted"
            @click="submitExam" />
          <Button
            type="button"
            label="开始新的"
            severity="secondary"
            class="restart-btn"
            :disabled="!nowProblemList.length"
            @click="restartCurrentMode"
          />
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
          <div v-for="(group, groupIndex) in examNumberGroups" :key="group.key" class="exam-number-group">
            <div class="exam-number-title">
              <span class="exam-index">{{ cnNumbers[groupIndex] ?? groupIndex + 1 }}、</span>
              <span>{{ group.label }}</span>
              <span class="exam-meta">（{{ group.indices.length }}题，每题{{ group.score }}分）</span>
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
          <div v-for="(problem, index) in nowProblemList" :key="`${problem.type}-${index}`" :class="[
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
      </template>
    </template>
  </section>
</template>

<style scoped>
.test-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.loading-panel {
  padding: 18px 0 10px;
  display: flex;
  justify-content: center;
}

.loading-card {
  width: min(520px, 100%);
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 18px;
  padding: 24px;
  display: grid;
  justify-items: center;
  gap: 8px;
  box-shadow: 0 16px 30px var(--vtix-shadow);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid var(--vtix-border);
  border-top-color: var(--vtix-primary-500);
  animation: spin 0.8s linear infinite;
}

.loading-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 16px;
}

.loading-sub {
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.loading-skeleton {
  width: 100%;
  display: grid;
  gap: 8px;
  margin-top: 6px;
}

.loading-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}

.loading-line.wide {
  height: 12px;
}

.page-head h1 {
  margin: 8px 0 6px;
  font-size: 32px;
  color: var(--vtix-text-strong);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  color: var(--vtix-text-muted);
  line-height: 1;
}

.back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--vtix-text);
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

.mode-tabs :deep(.p-tabmenu-tablist) {
  background: transparent;
}

.mode-tabs :deep(.p-tabmenuitem) {
  margin-right: 0;
}

.mode-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: var(--vtix-text-muted);
  font-weight: 700;
  padding: 8px 14px;
}

.mode-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: var(--vtix-surface-5);
  color: var(--vtix-text-strong);
  border-color: var(--vtix-border);
}

.mode-tabs :deep(.mobile-mode-menu.p-menu) {
  width: 100%;
  border: 1px solid var(--vtix-border);
  border-radius: 12px;
  box-shadow: 0 10px 24px var(--vtix-shadow);
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-list) {
  padding: 6px;
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-item-link) {
  border-radius: 10px;
  padding: 14px 16px;
  color: var(--vtix-text);
}

.mode-tabs :deep(.mobile-mode-menu .p-menu-item-link:hover) {
  background: var(--vtix-surface-5);
}

.record-panel {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.invite-panel {
  display: flex;
  justify-content: center;
  padding: 12px 0 8px;
}

.invite-card {
  width: min(520px, 100%);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 18px;
  background: var(--vtix-surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.invite-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 16px;
}

.invite-desc {
  margin: 0;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.invite-input {
  display: flex;
  gap: 10px;
}

.invite-input :deep(.p-inputtext) {
  flex: 1;
}

.invite-error {
  color: var(--vtix-danger-text);
  font-size: 12px;
}

.record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  color: var(--vtix-text-strong);
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
  color: var(--vtix-text-subtle);
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
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border-strong);
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
  color: var(--vtix-text-strong);
}

.record-meta {
  font-size: 12px;
  color: var(--vtix-text-muted);
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
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 16px 30px var(--vtix-shadow);
}

.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.question-type {
  background: var(--vtix-ink);
  color: var(--vtix-inverse-text);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.question-index {
  color: var(--vtix-text-muted);
  font-size: 13px;
  font-weight: 500;
}

.question-content {
  color: var(--vtix-text-strong);
  font-size: 18px;
  line-height: 1.6;
  margin-bottom: 14px;
  font-weight: 400;
  white-space: pre-wrap;
}

.question-no {
  margin-right: 6px;
  color: var(--vtix-text-muted);
  font-weight: 500;
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
  color: var(--vtix-text-strong);
}

.custom-head p {
  margin: 0;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.custom-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-label {
  font-weight: 700;
  color: var(--vtix-text-strong);
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
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
  font-weight: 500;
}

.custom-actions {
  display: flex;
  justify-content: flex-end;
}

.fill-input {
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface);
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 16px;
}

.fill-answer {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--vtix-warning-border);
  background: var(--vtix-warning-bg);
  color: var(--vtix-warning-text);
  font-size: 13px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.placeholder {
  color: var(--vtix-text-subtle);
  font-size: 14px;
}

.choice-row {
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface);
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 400;
  color: var(--vtix-text-strong);
  font-size: 16px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.choice-row:hover {
  background: var(--vtix-surface-5);
  border-color: var(--vtix-border);
}

.choice-label {
  flex: 1;
  text-align: left;
  display: block;
  width: 100%;
}

.choice-row.chosen {
  background: var(--vtix-surface-4);
  border-color: var(--vtix-info-solid);
}

.choice-row.correct {
  background: var(--vtix-success-bg);
  border-color: var(--vtix-success-solid);
}

.choice-row.wrong {
  background: var(--vtix-surface);
  border-color: var(--vtix-danger-solid);
}

.choice-row.missed {
  background: var(--vtix-warning-bg);
  border-color: var(--vtix-warning-solid);
}

.choice-row.incorrect .choice-label {
  color: var(--vtix-text-subtle);
  opacity: 0.5;
}

.submit-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.submit-row .restart-btn {
  margin-left: auto;
}

.submit-row :deep(.p-button-label) {
  white-space: nowrap;
}

.submit-row :deep(.p-button) {
  flex: 0 0 auto;
}

.list-panel {
  max-height: 420px;
  overflow: auto;
}

.list-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
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
  color: var(--vtix-text-muted);
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
  color: var(--vtix-text-strong);
}

.exam-meta {
  color: var(--vtix-text-subtle);
}

.exam-result {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--vtix-info-border);
  background: var(--vtix-info-bg);
  color: var(--vtix-info-text);
  font-size: 13px;
  margin-bottom: 12px;
}

.exam-score {
  font-weight: 800;
  color: var(--vtix-info-text);
}

.exam-score-sub {
  margin-top: 4px;
  color: var(--vtix-info-text);
}

.summary-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--vtix-surface-3);
  color: var(--vtix-text-muted);
  border: 1px solid var(--vtix-border-strong);
}

.summary-tag.is-correct {
  background: var(--vtix-success-bg);
  color: var(--vtix-success-text);
  border-color: var(--vtix-success-border);
}

.summary-tag.is-total {
  background: var(--vtix-info-bg);
  color: var(--vtix-info-text);
  border-color: var(--vtix-info-border);
}

.summary-tag.is-rate {
  background: var(--vtix-warning-bg);
  color: var(--vtix-warning-text);
  border-color: var(--vtix-warning-border);
}

.summary-tag.is-answered {
  background: var(--vtix-info-bg);
  color: var(--vtix-info-text);
  border-color: var(--vtix-info-border);
}

.summary-tag.is-time {
  background: var(--vtix-info-bg);
  color: var(--vtix-info-text);
  border-color: var(--vtix-info-border);
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
  color: var(--vtix-text-strong);
  font-size: 13px;
}

.number-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.number-btn {
  background: var(--vtix-surface);
  border-radius: 8px;
  width: 36px;
  height: 32px;
  padding: 0;
  font-weight: 700;
  cursor: pointer;
  color: var(--vtix-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  user-select: none;
  box-shadow: 0 8px 10px var(--vtix-shadow);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.number-btn:hover {
  background: var(--vtix-surface-5);
}

.number-btn.active {
    border-color: var(--vtix-text-strong) !important;
    background: var(--vtix-ink) !important;
    color: var(--vtix-inverse-text) !important;
  }

  .number-btn.answered {
    border-color: var(--vtix-info-solid) !important;
    color: var(--vtix-info-solid) !important;
}

.number-btn.correct {
  border-color: var(--vtix-success-solid) !important;
  color: var(--vtix-success-solid) !important;
}

  .number-btn.wrong {
    border-color: var(--vtix-danger-solid) !important;
    color: var(--vtix-danger-solid) !important;
  }

  .number-btn.active.answered {
    border-color: var(--vtix-info-solid) !important;
    background: var(--vtix-info-solid) !important;
    color: var(--vtix-inverse-text) !important;
  }

  .number-btn.active.correct {
    border-color: var(--vtix-success-solid) !important;
    background: var(--vtix-success-solid) !important;
    color: var(--vtix-inverse-text) !important;
  }

  .number-btn.active.wrong {
    border-color: var(--vtix-danger-solid) !important;
    background: var(--vtix-danger-solid) !important;
    color: var(--vtix-inverse-text) !important;
  }

  .number-btn.answered:hover,
  .number-btn.correct:hover,
  .number-btn.wrong:hover {
    background: var(--vtix-surface-5);
    border-color: currentColor;
  }

  .number-btn.active.answered:hover,
  .number-btn.active.correct:hover,
  .number-btn.active.wrong:hover {
    background: currentColor;
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
    background: var(--vtix-surface);
    box-shadow: 0 -12px 24px var(--vtix-shadow-strong);
  }

  .dock-item {
    border: none;
    background: var(--vtix-surface);
    border-radius: 0;
    padding: 6px 6px 4px;
    height: 100%;
    font-weight: 700;
    color: var(--vtix-text-muted);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .dock-item.active {
    background: var(--vtix-surface-5);
    color: var(--vtix-text);
  }

  .dock-title {
    font-size: 13px;
    line-height: 1.1;
  }

  .dock-sub {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.1;
    color: var(--vtix-text-subtle);
  }

  .dock-sub.is-accent {
    color: var(--vtix-primary-600);
  }

  .dock-sub.is-progress {
    color: var(--vtix-primary-600);
  }

  .dock-item.active .dock-sub {
    color: var(--vtix-text-muted);
  }

  .dock-item.active .dock-sub.is-accent {
    color: var(--vtix-primary-700);
  }

  .dock-item.active .dock-sub.is-progress {
    color: var(--vtix-primary-700);
  }

  .dock-item :deep(.p-ink) {
    background: var(--vtix-overlay-soft);
  }

  .mode-tabs {
    padding-bottom: calc(var(--mobile-menu-height) + 30px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
