<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import RadioButton from 'primevue/radiobutton'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'
import { pushLoginRequired } from '../../utils/auth'

type BrawlSetItem = {
  code: string
  title: string
  year: number
  creatorName: string
  isPublic: boolean
  questionCount: number
  onlineCount: number
}

type BrawlScore = {
  userId: string
  userName: string
  score: number
}

type BrawlQuestion = {
  id: string
  type: 1 | 2 | 4
  content: string
  choices: string[]
}

type MatchFoundPayload = {
  matchId?: string
  targetScore?: number
  self?: { userId?: string; userName?: string }
  opponent?: { userId?: string; userName?: string }
  scores?: BrawlScore[]
}

type NewQuestionPayload = {
  matchId?: string
  round?: number
  question?: BrawlQuestion
  scores?: BrawlScore[]
}

type RoundResultPayload = {
  matchId?: string
  submittedByUserId?: string
  passed?: boolean
  scores?: BrawlScore[]
  correctAnswer?: number[]
}

type MatchFinishedPayload = {
  matchId?: string
  winnerUserId?: string | null
  winnerName?: string | null
  scores?: BrawlScore[]
}

type MatchResumePayload = {
  matchId?: string
  targetScore?: number
  self?: { userId?: string; userName?: string }
  opponent?: { userId?: string; userName?: string }
  scores?: BrawlScore[]
  round?: number
  question?: BrawlQuestion | null
  lockedByUserId?: string | null
  players?: Array<{
    userId?: string
    userName?: string
    connected?: boolean
    disconnectDeadlineAt?: number | null
  }>
}

type PlayerPresencePayload = {
  matchId?: string
  userId?: string
  connected?: boolean
  disconnectDeadlineAt?: number | null
}

type PendingRoundPayload = {
  round: number
  question: BrawlQuestion
}

type BattleCardMode = 'overlay' | 'question' | 'wait'
type BattleOverlayTone = 'normal' | 'correct' | 'wrong'
type MatchSnapshotPayload = MatchFoundPayload | MatchResumePayload

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const socketBase = import.meta.env.VITE_SOCKET_BASE ?? apiBase
const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const loadError = ref('')
const items = ref<BrawlSetItem[]>([])
const onlineCounts = ref<Record<string, number>>({})
const totalRecords = ref(0)
const page = ref(1)
const pageSize = ref(6)
const search = ref('')
const debouncedSearch = ref('')
let searchTimer: number | null = null
let queueWaitTimer: number | null = null
let queueStartedAt: number | null = null

const viewState = ref<'select' | 'matching' | 'battle' | 'result'>('select')
const selectedSetCode = ref('')
const connected = ref(false)
const queuePosition = ref<number | null>(null)
const queueWaitSeconds = ref(0)
const socketError = ref('')

const matchId = ref('')
const targetScore = ref(8)
const selfUserId = computed(() => String(userStore.user?.id ?? ''))
const selfUserName = ref('')
const opponentUserId = ref('')
const opponentUserName = ref('')
const scoreBoard = ref<BrawlScore[]>([])
const currentQuestion = ref<BrawlQuestion | null>(null)
const currentRound = ref(0)
const selectedAnswers = ref<number[]>([])
const correctAnswers = ref<number[]>([])
const roundResolved = ref(false)
const lockedByUserId = ref('')
const roundHint = ref('')
const matchFinished = ref<MatchFinishedPayload | null>(null)
const battleCardMode = ref<BattleCardMode>('wait')
const battleOverlayText = ref('')
const battleOverlayTone = ref<BattleOverlayTone>('normal')
const pendingRound = ref<PendingRoundPayload | null>(null)
const preMatchIntroReady = ref(false)
const firstRoundBannerShown = ref(false)
const revealLocked = ref(false)
const opponentDisconnected = ref(false)
const opponentDisconnectDeadlineAt = ref<number | null>(null)
const opponentDisconnectRemainingSeconds = ref(0)

const MATCH_OPPONENT_INTRO_DURATION_MS = 3000
const ROUND_BANNER_DURATION_MS = 1000
const RESULT_BANNER_DELAY_MS = 500
const RESULT_BANNER_DURATION_MS = 1200
const OPPONENT_DISCONNECT_WAITING_TEXT = '对手掉线，等待中'
let battleOverlayTimer: number | null = null
let resultBannerDelayTimer: number | null = null
let opponentDisconnectTimer: number | null = null

let socket: Socket | null = null
const choiceKeyMap: Record<string, number> = {
  q: 0,
  w: 1,
  e: 2,
  r: 3,
  t: 4,
  y: 5,
  u: 6,
  i: 7,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7
}

const displayItems = computed(() =>
  items.value.map((item) => ({
    ...item,
    onlineCount: Number(onlineCounts.value[item.code] ?? item.onlineCount ?? 0)
  }))
)

const selectedSet = computed(() =>
  displayItems.value.find((item) => item.code === selectedSetCode.value) ?? null
)

const selfScore = computed(
  () => scoreBoard.value.find((item) => item.userId === selfUserId.value)?.score ?? 0
)
const opponentScore = computed(
  () => scoreBoard.value.find((item) => item.userId === opponentUserId.value)?.score ?? 0
)
const battleProgress = computed(() => {
  const target = Math.max(1, Math.floor(Number(targetScore.value) || 0))
  const self = Math.max(0, Math.floor(Number(selfScore.value) || 0))
  const opponent = Math.max(0, Math.floor(Number(opponentScore.value) || 0))
  const selfPercent = Math.min(100, Math.round((self / target) * 100))
  const opponentPercent = Math.min(100, Math.round((opponent / target) * 100))
  return {
    target,
    selfPercent,
    opponentPercent
  }
})

const isSingleChoice = computed(
  () => currentQuestion.value?.type === 1 || currentQuestion.value?.type === 4
)
const isMultiChoice = computed(() => currentQuestion.value?.type === 2)
const isRoundLocked = computed(
  () => Boolean(lockedByUserId.value) && lockedByUserId.value !== selfUserId.value
)
const canConfirm = computed(() => {
  if (!currentQuestion.value) return false
  if (!selectedAnswers.value.length) return false
  if (Boolean(lockedByUserId.value)) return false
  if (opponentDisconnected.value) return false
  if (roundResolved.value) return false
  if (viewState.value !== 'battle') return false
  if (battleCardMode.value !== 'question') return false
  return true
})
const showSetSelection = computed(
  () => viewState.value === 'select' || viewState.value === 'matching'
)
const showSocketPendingState = computed(
  () => showSetSelection.value && !connected.value
)
const showEmptySetState = computed(
  () =>
    showSetSelection.value &&
    connected.value &&
    !loading.value &&
    !loadError.value &&
    displayItems.value.length === 0
)
const opponentDisconnectText = computed(() => {
  const total = Math.max(0, Math.ceil(opponentDisconnectRemainingSeconds.value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const queueWaitText = computed(() => {
  const total = Math.max(0, Math.floor(queueWaitSeconds.value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

function startQueueTimer() {
  if (queueStartedAt === null) {
    queueStartedAt = Date.now()
  }
  if (queueWaitTimer !== null) {
    window.clearInterval(queueWaitTimer)
  }
  queueWaitSeconds.value = Math.max(0, Math.floor((Date.now() - queueStartedAt) / 1000))
  queueWaitTimer = window.setInterval(() => {
    if (queueStartedAt === null) {
      queueWaitSeconds.value = 0
      return
    }
    queueWaitSeconds.value = Math.max(0, Math.floor((Date.now() - queueStartedAt) / 1000))
  }, 1000)
}

function stopQueueTimer(reset = true) {
  if (queueWaitTimer !== null) {
    window.clearInterval(queueWaitTimer)
    queueWaitTimer = null
  }
  if (reset) {
    queueStartedAt = null
    queueWaitSeconds.value = 0
  }
}

function stopOpponentDisconnectCountdown(reset = true) {
  if (opponentDisconnectTimer !== null) {
    window.clearInterval(opponentDisconnectTimer)
    opponentDisconnectTimer = null
  }
  if (reset) {
    opponentDisconnected.value = false
    opponentDisconnectDeadlineAt.value = null
    opponentDisconnectRemainingSeconds.value = 0
  }
}

function syncOpponentDisconnectRemaining() {
  const deadline = opponentDisconnectDeadlineAt.value
  if (!deadline) {
    opponentDisconnectRemainingSeconds.value = 0
    return
  }
  const remaining = (deadline - Date.now()) / 1000
  opponentDisconnectRemainingSeconds.value = Math.max(0, remaining)
  if (remaining <= 0) {
    stopOpponentDisconnectCountdown(false)
  }
}

function startOpponentDisconnectCountdown(deadlineAt: number | null | undefined) {
  const parsed = Number(deadlineAt ?? 0)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    stopOpponentDisconnectCountdown(true)
    return
  }
  opponentDisconnected.value = true
  opponentDisconnectDeadlineAt.value = parsed
  syncOpponentDisconnectRemaining()
  if (opponentDisconnectTimer !== null) {
    window.clearInterval(opponentDisconnectTimer)
  }
  opponentDisconnectTimer = window.setInterval(() => {
    syncOpponentDisconnectRemaining()
  }, 1000)
}

function toLogin() {
  const redirect = typeof route.fullPath === 'string' ? route.fullPath : '/brawl'
  void pushLoginRequired(router, redirect)
}

async function loadProblemSets() {
  loading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      ...(debouncedSearch.value ? { q: debouncedSearch.value } : {})
    })
    const response = await fetch(`${apiBase}/api/brawl/problem-sets?${params.toString()}`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      toLogin()
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const total = Number(response.headers.get('x-total-count') ?? 0)
    totalRecords.value = Number.isFinite(total) ? total : 0
    const data = (await response.json()) as BrawlSetItem[]
    items.value = Array.isArray(data) ? data : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
    totalRecords.value = 0
  } finally {
    loading.value = false
  }
}

function handlePage(event: PageState) {
  page.value = (event.page ?? 0) + 1
}

function applyScores(scores: unknown) {
  if (!Array.isArray(scores)) return
  scoreBoard.value = scores
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        userId: String(row.userId ?? ''),
        userName: String(row.userName ?? ''),
        score: Number(row.score ?? 0)
      } as BrawlScore
    })
    .filter((item): item is BrawlScore => Boolean(item?.userId))
}

function clearBattleOverlayTimer() {
  if (battleOverlayTimer !== null) {
    window.clearTimeout(battleOverlayTimer)
    battleOverlayTimer = null
  }
}

function clearResultBannerDelayTimer() {
  if (resultBannerDelayTimer !== null) {
    window.clearTimeout(resultBannerDelayTimer)
    resultBannerDelayTimer = null
  }
}

function clearBattleFlowTimers() {
  clearResultBannerDelayTimer()
  clearBattleOverlayTimer()
}

function setBattleOverlay(text: string, tone: BattleOverlayTone = 'normal') {
  battleOverlayText.value = text
  battleOverlayTone.value = tone
  battleCardMode.value = 'overlay'
}

function toAnswerIndexes(value: unknown) {
  if (!Array.isArray(value)) return [] as number[]
  const set = new Set<number>()
  for (const item of value) {
    const parsed = Math.floor(Number(item))
    if (!Number.isFinite(parsed) || parsed < 0) continue
    set.add(parsed)
  }
  return Array.from(set).sort((a, b) => a - b)
}

function resetRoundState() {
  selectedAnswers.value = []
  lockedByUserId.value = ''
  roundHint.value = ''
  roundResolved.value = false
  correctAnswers.value = []
}

function applyMatchSnapshot(payload: MatchSnapshotPayload) {
  matchId.value = String(payload.matchId ?? '')
  targetScore.value = Math.max(1, Math.floor(Number(payload.targetScore ?? 8) || 8))
  selfUserName.value = String(payload.self?.userName ?? userStore.user?.name ?? '')
  opponentUserId.value = String(payload.opponent?.userId ?? '')
  opponentUserName.value = String(payload.opponent?.userName ?? '对手')
  applyScores(payload.scores)
  viewState.value = 'battle'
  queuePosition.value = null
  stopQueueTimer(true)
}

function applyOpponentPresenceFromPlayers(players: MatchResumePayload['players']) {
  const list = Array.isArray(players) ? players : []
  const opponentPresence = list.find(
    (player) => String(player?.userId ?? '') === String(opponentUserId.value)
  )
  if (opponentPresence && opponentPresence.connected === false) {
    startOpponentDisconnectCountdown(Number(opponentPresence.disconnectDeadlineAt ?? 0))
    return
  }
  stopOpponentDisconnectCountdown(true)
}

function showQuestion(payload: PendingRoundPayload) {
  currentRound.value = payload.round
  currentQuestion.value = payload.question
  resetRoundState()
  battleCardMode.value = 'question'
}

function playRoundBanner(round: number, after?: () => void) {
  revealLocked.value = true
  setBattleOverlay(round <= 1 ? '第一题' : `第 ${round} 题`)
  clearBattleOverlayTimer()
  battleOverlayTimer = window.setTimeout(() => {
    battleOverlayTimer = null
    revealLocked.value = false
    after?.()
    tryPresentPendingRound()
  }, ROUND_BANNER_DURATION_MS)
}

function tryPresentPendingRound() {
  if (!preMatchIntroReady.value || revealLocked.value) return
  const next = pendingRound.value
  if (!next) {
    if (!currentQuestion.value) {
      battleCardMode.value = 'wait'
    }
    return
  }
  if (opponentDisconnected.value) {
    setBattleOverlay(OPPONENT_DISCONNECT_WAITING_TEXT, 'wrong')
    return
  }
  pendingRound.value = null
  if (next.round <= 1 && firstRoundBannerShown.value) {
    showQuestion(next)
    return
  }
  playRoundBanner(next.round, () => {
    showQuestion(next)
  })
}

function startMatchOpeningSequence() {
  preMatchIntroReady.value = false
  firstRoundBannerShown.value = false
  revealLocked.value = true
  setBattleOverlay(`对手为 ${opponentUserName.value || '对手'}，即将开始`)
  clearBattleFlowTimers()
  battleOverlayTimer = window.setTimeout(() => {
    setBattleOverlay('第一题')
    firstRoundBannerShown.value = true
    clearBattleOverlayTimer()
    battleOverlayTimer = window.setTimeout(() => {
      battleOverlayTimer = null
      preMatchIntroReady.value = true
      revealLocked.value = false
      tryPresentPendingRound()
    }, ROUND_BANNER_DURATION_MS)
  }, MATCH_OPPONENT_INTRO_DURATION_MS)
}

function showRoundResultBanner(passed: boolean, bySelf: boolean) {
  revealLocked.value = true
  clearBattleFlowTimers()
  resultBannerDelayTimer = window.setTimeout(() => {
    resultBannerDelayTimer = null
    setBattleOverlay(
      bySelf
        ? passed
          ? '作答正确'
          : '作答错误'
        : passed
        ? '对手作答正确'
        : '对手作答错误',
      passed ? 'correct' : 'wrong'
    )
    clearBattleOverlayTimer()
    battleOverlayTimer = window.setTimeout(() => {
      battleOverlayTimer = null
      revealLocked.value = false
      if (pendingRound.value) {
        tryPresentPendingRound()
        return
      }
      battleCardMode.value = currentQuestion.value ? 'question' : 'wait'
    }, RESULT_BANNER_DURATION_MS)
  }, RESULT_BANNER_DELAY_MS)
}

function getChoiceClass(index: number) {
  const selected = selectedAnswers.value.includes(index)
  if (!roundResolved.value) {
    return {
      chosen: selected,
      locked: isRoundLocked.value
    }
  }
  const correct = correctAnswers.value.includes(index)
  return {
    correct: selected && correct,
    wrong: selected && !correct,
    missed: !selected && correct,
    incorrect: !correct
  }
}

function resetBattleState() {
  matchId.value = ''
  opponentUserId.value = ''
  opponentUserName.value = ''
  currentQuestion.value = null
  currentRound.value = 0
  selectedAnswers.value = []
  correctAnswers.value = []
  roundResolved.value = false
  lockedByUserId.value = ''
  roundHint.value = ''
  matchFinished.value = null
  scoreBoard.value = []
  battleCardMode.value = 'wait'
  battleOverlayText.value = ''
  battleOverlayTone.value = 'normal'
  pendingRound.value = null
  preMatchIntroReady.value = false
  firstRoundBannerShown.value = false
  revealLocked.value = false
  clearBattleFlowTimers()
  stopQueueTimer(true)
  stopOpponentDisconnectCountdown(true)
}

function connectSocket() {
  socket = io(socketBase, {
    withCredentials: true,
    path: '/socket.io',
    transports: ['websocket', 'polling']
  })
  socket.on('connect', () => {
    connected.value = true
    socketError.value = ''
  })
  socket.on('disconnect', () => {
    connected.value = false
    if (viewState.value !== 'matching') {
      stopQueueTimer(true)
    }
  })
  socket.on('brawl:auth-required', () => {
    toLogin()
  })
  socket.on('brawl:lobby-state', (payload: { onlineCounts?: Record<string, number> }) => {
    onlineCounts.value = payload?.onlineCounts ?? {}
  })
  socket.on('brawl:error', (payload: { message?: string }) => {
    socketError.value = payload?.message || '操作失败'
  })
  socket.on('brawl:selected-set', (payload: { setCode?: string | null }) => {
    selectedSetCode.value = typeof payload?.setCode === 'string' ? payload.setCode : ''
    if (!selectedSetCode.value && viewState.value === 'matching') {
      viewState.value = 'select'
      stopQueueTimer(true)
    }
  })
  socket.on('brawl:queue-status', (payload: { queued?: boolean; position?: number | null }) => {
    queuePosition.value = Number(payload?.position ?? 0) > 0 ? Number(payload?.position) : null
    if (payload?.queued) {
      viewState.value = 'matching'
      startQueueTimer()
    } else if (viewState.value === 'matching') {
      viewState.value = 'select'
      stopQueueTimer(true)
    }
  })
  socket.on('brawl:match-found', (payload: MatchFoundPayload) => {
    applyMatchSnapshot(payload)
    currentQuestion.value = null
    currentRound.value = 0
    resetRoundState()
    pendingRound.value = null
    matchFinished.value = null
    battleCardMode.value = 'overlay'
    battleOverlayTone.value = 'normal'
    battleOverlayText.value = ''
    startMatchOpeningSequence()
    stopOpponentDisconnectCountdown(true)
  })
  socket.on('brawl:match-resume', (payload: MatchResumePayload) => {
    applyMatchSnapshot(payload)
    clearBattleFlowTimers()
    preMatchIntroReady.value = true
    revealLocked.value = false
    const nextRound = Number(payload.round ?? currentRound.value)
    currentRound.value = Number.isFinite(nextRound) && nextRound > 0 ? nextRound : currentRound.value
    currentQuestion.value = payload.question ?? null
    selectedAnswers.value = []
    correctAnswers.value = []
    roundResolved.value = false
    lockedByUserId.value = String(payload.lockedByUserId ?? '')
    roundHint.value = ''
    firstRoundBannerShown.value = currentRound.value > 0
    pendingRound.value = null
    battleCardMode.value = currentQuestion.value ? 'question' : 'wait'
    matchFinished.value = null
    applyOpponentPresenceFromPlayers(payload.players)
  })
  socket.on('brawl:new-question', (payload: NewQuestionPayload) => {
    if (payload.matchId && payload.matchId !== matchId.value) return
    if (!payload.question) return
    applyScores(payload.scores)
    const round = Number(payload.round ?? currentRound.value + 1)
    if (!Number.isFinite(round) || round <= 0) return
    pendingRound.value = {
      round,
      question: payload.question
    }
    tryPresentPendingRound()
  })
  socket.on('brawl:round-locked', (payload: { matchId?: string; lockedByUserId?: string }) => {
    if (payload.matchId && payload.matchId !== matchId.value) return
    lockedByUserId.value = String(payload.lockedByUserId ?? '')
    if (lockedByUserId.value && lockedByUserId.value !== selfUserId.value) {
      roundHint.value = '对手已确认，本题你无法作答。'
      return
    }
    roundHint.value = ''
  })
  socket.on('brawl:round-result', (payload: RoundResultPayload) => {
    if (payload.matchId && payload.matchId !== matchId.value) return
    applyScores(payload.scores)
    roundResolved.value = true
    correctAnswers.value = toAnswerIndexes(payload.correctAnswer)
    const submittedBy = String(payload.submittedByUserId ?? '')
    const passed = Boolean(payload.passed)
    const bySelf = submittedBy === selfUserId.value
    roundHint.value = ''
    showRoundResultBanner(passed, bySelf)
  })
  socket.on('brawl:player-presence', (payload: PlayerPresencePayload) => {
    if (payload.matchId && payload.matchId !== matchId.value) return
    const targetUserId = String(payload.userId ?? '')
    if (!targetUserId) return
    if (targetUserId !== opponentUserId.value) return
    if (payload.connected === false) {
      startOpponentDisconnectCountdown(Number(payload.disconnectDeadlineAt ?? 0))
      if (pendingRound.value) {
        tryPresentPendingRound()
      }
      return
    }
    stopOpponentDisconnectCountdown(true)
    if (pendingRound.value) {
      tryPresentPendingRound()
    }
  })
  socket.on('brawl:match-finished', (payload: MatchFinishedPayload) => {
    if (payload.matchId && payload.matchId !== matchId.value) return
    applyScores(payload.scores)
    matchFinished.value = payload
    clearBattleFlowTimers()
    stopOpponentDisconnectCountdown(true)
    viewState.value = 'result'
  })
}

function handleSelectSet(code: string) {
  if (!socket) return
  socketError.value = ''
  socket.emit('brawl:select-set', { code })
}

function handleBackToSetSelection() {
  if (!socket) return
  socket.emit('brawl:cancel-match')
  socket.emit('brawl:select-set', { code: null })
  viewState.value = 'select'
  selectedSetCode.value = ''
  queuePosition.value = null
  stopQueueTimer(true)
}

function startMatch() {
  if (!socket || !selectedSetCode.value) return
  socketError.value = ''
  viewState.value = 'matching'
  startQueueTimer()
  socket.emit('brawl:start-match')
}

function cancelMatching() {
  if (!socket) return
  socket.emit('brawl:cancel-match')
  viewState.value = 'select'
  stopQueueTimer(true)
}

function toggleChoice(index: number) {
  if (!currentQuestion.value) return
  if (battleCardMode.value !== 'question') return
  if (roundResolved.value) return
  if (isRoundLocked.value) return
  if (isSingleChoice.value) {
    selectedAnswers.value = [index]
    return
  }
  if (selectedAnswers.value.includes(index)) {
    selectedAnswers.value = selectedAnswers.value.filter((item) => item !== index)
  } else {
    selectedAnswers.value = [...selectedAnswers.value, index].sort((a, b) => a - b)
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

function handleBattleKeydown(event: KeyboardEvent) {
  if (viewState.value !== 'battle') return
  if (battleCardMode.value !== 'question') return
  if (!currentQuestion.value) return
  if (isTypingTarget(event.target)) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  const key = event.key.toLowerCase()
  if (key === 'enter') {
    if (!canConfirm.value) return
    event.preventDefault()
    submitAnswer()
    return
  }

  const choiceIndex = choiceKeyMap[key]
  if (choiceIndex === undefined) return
  if (choiceIndex >= currentQuestion.value.choices.length) return
  event.preventDefault()
  toggleChoice(choiceIndex)
}

function submitAnswer() {
  if (!socket || !canConfirm.value || !matchId.value) return
  socket.emit('brawl:submit-answer', {
    matchId: matchId.value,
    answers: [...selectedAnswers.value]
  })
}

function returnToMatching() {
  viewState.value = 'select'
  stopQueueTimer(true)
  resetBattleState()
}

watch([page, pageSize], () => {
  void loadProblemSets()
}, { immediate: true })

watch(search, (value) => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
  }
  searchTimer = window.setTimeout(() => {
    debouncedSearch.value = value.trim()
    if (page.value !== 1) {
      page.value = 1
      return
    }
    void loadProblemSets()
  }, 500)
})

watch(
  () => userStore.user,
  (value) => {
    if (!value) {
      toLogin()
    }
  }
)

onMounted(() => {
  if (!userStore.user) {
    toLogin()
    return
  }
  window.addEventListener('keydown', handleBattleKeydown, true)
  connectSocket()
})

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
  }
  clearBattleFlowTimers()
  stopOpponentDisconnectCountdown(true)
  stopQueueTimer(true)
  window.removeEventListener('keydown', handleBattleKeydown, true)
  socket?.disconnect()
  socket = null
})
</script>

<template>
  <section class="brawl-page">
    <header class="page-head">
      <div class="page-title">
        <div class="eyebrow">竞技练习</div>
        <h1>题库大乱斗</h1>
      </div>
      <div class="page-actions">
        <Button
          v-if="showSetSelection && !selectedSet"
          label="刷新题库"
          :loading="loading"
          severity="secondary"
          text
          size="small"
          @click="loadProblemSets"
        />
      </div>
    </header>

    <div class="status-row">
      <Tag :value="connected ? '连接正常' : '连接中'" :severity="connected ? 'success' : 'warning'" />
      <Tag v-if="selectedSetCode" :value="`题库 ${selectedSetCode}`" severity="info" />
      <Tag
        v-if="viewState === 'matching'"
        :value="queuePosition ? `匹配中（${queueWaitText} · 队列第 ${queuePosition} 位）` : `匹配中（${queueWaitText}）`"
        severity="warning"
      />
    </div>

    <div v-if="loadError || socketError" class="error-box">
      <span class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>{{ loadError || socketError }}</span>
    </div>

    <Transition name="stage-switch" mode="out-in">
      <section v-if="showSetSelection" key="lobby" class="view-stage">
      <Transition name="lobby-switch" mode="out-in">
        <div v-if="showSocketPendingState" key="pending" class="center-panel">
          <div class="center-title">连接服务器中...</div>
          <div class="center-sub">正在同步实时大厅状态</div>
        </div>

        <section v-else-if="selectedSet" key="selected" class="selected-hero">
          <div class="selected-hero-inner">
            <div class="selected-eyebrow">已选择题库</div>
            <div class="selected-title">{{ selectedSet.title }}</div>
            <div class="selected-meta">
              <Tag class="selected-online-tag" :value="`在线 ${selectedSet.onlineCount}`" severity="danger" />
              <span class="selected-meta-chip">编号 {{ selectedSet.code }}</span>
              <span class="selected-meta-chip">题目 {{ selectedSet.questionCount }}</span>
              <span class="selected-meta-chip">作者 {{ selectedSet.creatorName || '匿名' }}</span>
            </div>
            <div v-if="viewState === 'matching'" class="matching-tip">
              {{ queuePosition ? `正在匹配 ${queueWaitText}，当前排队第 ${queuePosition} 位` : `正在匹配对手，已等待 ${queueWaitText}` }}
            </div>
            <div class="selected-actions">
              <Button
                v-if="viewState !== 'matching'"
                label="开始匹配"
                icon="pi pi-bolt"
                @click="startMatch"
              />
              <Button
                v-else
                label="取消匹配"
                severity="secondary"
                text
                @click="cancelMatching"
              />
              <Button
                label="返回选择题库"
                severity="secondary"
                text
                @click="handleBackToSetSelection"
              />
            </div>
          </div>
        </section>

        <div v-else key="list" class="lobby-list">
          <div class="toolbar">
            <InputText v-model="search" placeholder="搜索题库标题、编号、作者" />
          </div>

          <div v-if="loading" class="center-panel">
            <div class="center-title">题库加载中...</div>
            <div class="center-sub">正在获取乱斗题库列表</div>
          </div>

          <div v-else-if="showEmptySetState" class="center-panel">
            <div class="center-title">暂无可选题库</div>
            <div class="center-sub">可稍后刷新重试</div>
          </div>

          <TransitionGroup v-else name="brawl-card" tag="div" class="cards">
            <article
              v-for="item in displayItems"
              :key="item.code"
              :class="['set-card', { active: item.code === selectedSetCode, disabled: viewState === 'matching' }]"
              role="button"
              :tabindex="viewState === 'matching' ? -1 : 0"
              @click="viewState !== 'matching' && handleSelectSet(item.code)"
              @keydown.enter.prevent="viewState !== 'matching' && handleSelectSet(item.code)"
              @keydown.space.prevent="viewState !== 'matching' && handleSelectSet(item.code)"
            >
              <div class="set-head">
                <div class="set-title">{{ item.title }}</div>
                <div class="set-tags">
                  <Tag
                    class="set-public-tag"
                    :value="item.isPublic ? '公开' : '非公开'"
                    :severity="item.isPublic ? 'success' : 'contrast'"
                  />
                  <Tag
                    class="set-online-tag"
                    :value="`在线 ${item.onlineCount}`"
                    severity="danger"
                  />
                </div>
              </div>

              <div class="set-stats">
                <div class="set-stat">
                  <div class="stat-label">题目数量</div>
                  <div class="stat-value">{{ item.questionCount }}</div>
                </div>
                <div class="set-stat">
                  <div class="stat-label">题库年份</div>
                  <div class="stat-value">{{ item.year }}</div>
                </div>
              </div>

              <div class="set-meta">
                <span class="meta-label">出题者</span>
                <span class="meta-value">{{ item.creatorName || '匿名' }}</span>
              </div>
            </article>
          </TransitionGroup>

          <div v-if="totalRecords > 0" class="pagination">
            <Paginator
              :first="(page - 1) * pageSize"
              :rows="pageSize"
              :totalRecords="totalRecords"
              template="PrevPageLink PageLinks NextPageLink"
              @page="handlePage"
            />
          </div>
        </div>
      </Transition>
      </section>

      <section v-else-if="viewState === 'battle'" key="battle" class="view-stage">
      <section class="battle-progress-panel">
        <div class="progress-head">
          <div>
            <div class="progress-title">对战进度</div>
            <div class="progress-meta">第 {{ currentRound }} 题 · 目标 {{ battleProgress.target }} 分</div>
          </div>
          <div class="progress-score-inline">
            <span class="self">{{ selfScore }}</span>
            <span class="sep">:</span>
            <span class="opponent">{{ opponentScore }}</span>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-track-self" :style="{ width: `${battleProgress.selfPercent}%` }"></div>
          <div class="progress-track-opponent" :style="{ width: `${battleProgress.opponentPercent}%` }"></div>
        </div>
        <div class="progress-track-meta">
          <span>{{ selfUserName || userStore.user?.name || '我' }} · {{ battleProgress.selfPercent }}%</span>
          <span class="progress-opponent-meta">
            <span>{{ opponentUserName || '对手' }} · {{ battleProgress.opponentPercent }}%</span>
            <Tag
              v-if="opponentDisconnected"
              class="opponent-disconnect-tag"
              :value="`掉线 ${opponentDisconnectText}`"
              severity="danger"
            />
          </span>
        </div>
      </section>

      <section class="question-panel question-stage-panel">
        <Transition name="overlay-fade" mode="out-in">
          <div
            v-if="battleCardMode === 'overlay'"
            :key="`overlay-${battleOverlayText}`"
            class="question-overlay-layer"
            aria-live="polite"
          >
            <div class="question-overlay-mask" />
            <div :class="['round-intro-text', 'question-overlay-text', `is-${battleOverlayTone}`]">
              {{ battleOverlayText }}
            </div>
          </div>
        </Transition>

        <template v-if="battleCardMode === 'question' && currentQuestion">
          <div class="question-header">
            <div class="question-type">
              {{ currentQuestion.type === 1 ? '单选题' : currentQuestion.type === 2 ? '多选题' : '判断题' }}
            </div>
            <div class="question-index">第 {{ currentRound }} 题</div>
          </div>
          <div class="question-content">
            <span class="question-no">{{ currentRound }}.</span>
            <span>{{ currentQuestion.content }}</span>
          </div>
          <div class="question-choices">
            <label
              v-for="(choice, index) in currentQuestion.choices"
              :key="`${currentQuestion.id}-${index}`"
              :class="['choice-row', getChoiceClass(index)]"
            >
              <RadioButton
                v-if="isSingleChoice"
                :modelValue="selectedAnswers[0] ?? null"
                :value="index"
                :disabled="isRoundLocked || roundResolved"
                @update:modelValue="toggleChoice(index)"
              />
              <Checkbox
                v-else-if="isMultiChoice"
                :modelValue="selectedAnswers"
                :value="index"
                :disabled="isRoundLocked || roundResolved"
                @update:modelValue="toggleChoice(index)"
              />
              <span class="choice-label">
                <span class="choice-prefix">{{ choices[index] || index + 1 }}.</span>
                <span>{{ choice }}</span>
              </span>
            </label>
          </div>
          <div class="submit-row">
            <Button label="确认作答" :disabled="!canConfirm" @click="submitAnswer" />
            <span v-if="roundHint" class="submit-hint">{{ roundHint }}</span>
          </div>
        </template>

        <div v-else class="question-wait-state" aria-hidden="true" />
      </section>
      </section>

      <section v-else-if="viewState === 'result'" key="result" class="view-stage view-stage-result">
        <div class="result-card">
          <div class="result-status">
            <span class="pi pi-flag-fill" aria-hidden="true" />
            <span>对局结算</span>
          </div>
          <h2>
            {{
              matchFinished?.winnerUserId
                ? matchFinished.winnerUserId === selfUserId
                  ? '你获胜了'
                  : '你失败了'
                : '对局结束'
            }}
          </h2>
          <div class="result-score">{{ selfScore }} : {{ opponentScore }}</div>
          <div class="result-sub">
            胜者：{{ matchFinished?.winnerName || '无' }}
          </div>
          <Button label="返回匹配界面" @click="returnToMatching" />
        </div>
      </section>
    </Transition>
  </section>
</template>

<style scoped>
.brawl-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-stage-result {
  align-items: stretch;
}

.lobby-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-switch-enter-active,
.stage-switch-leave-active,
.lobby-switch-enter-active,
.lobby-switch-leave-active {
  transition:
    opacity 240ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.stage-switch-enter-from,
.stage-switch-leave-to,
.lobby-switch-enter-from,
.lobby-switch-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.brawl-card-enter-active,
.brawl-card-leave-active,
.brawl-card-move {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.brawl-card-enter-from,
.brawl-card-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.page-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.page-title h1 {
  margin: 4px 0 0;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.page-title p {
  margin: 0;
  font-size: 14px;
  color: var(--vtix-text-muted);
}

.page-actions {
  display: flex;
  align-items: center;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.error-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--vtix-danger-border);
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  border-radius: 14px;
  padding: 10px 14px;
}

.center-panel {
  min-height: 200px;
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
  border-radius: 16px;
  box-shadow: 0 14px 26px var(--vtix-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 18px;
}

.center-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.center-sub {
  font-size: 13px;
  color: var(--vtix-text-muted);
}

.selected-hero {
  min-height: clamp(320px, 56vh, 560px);
  border: 1px solid var(--vtix-border);
  background: linear-gradient(180deg, var(--vtix-surface-2) 0%, var(--vtix-surface) 42%);
  border-radius: 20px;
  box-shadow: 0 18px 34px var(--vtix-shadow);
  display: grid;
  place-items: center;
  padding: 20px;
}

.selected-hero-inner {
  width: min(920px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.selected-eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.selected-title {
  font-size: clamp(30px, 5vw, 46px);
  line-height: 1.2;
  font-weight: 800;
  color: var(--vtix-text-strong);
}

.selected-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.selected-meta-chip {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
  color: var(--vtix-text-muted);
  font-size: 12px;
}

.selected-online-tag {
  white-space: nowrap;
  background: var(--vtix-danger-solid) !important;
  border-color: var(--vtix-danger-solid) !important;
  color: var(--vtix-inverse-text) !important;
}

.matching-tip {
  border: 1px solid var(--vtix-warning-border);
  background: var(--vtix-warning-bg);
  color: var(--vtix-warning-text);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
}

.selected-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.toolbar {
  display: flex;
}

.toolbar :deep(.p-inputtext) {
  width: 100%;
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.set-card {
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
  border-radius: 16px;
  padding: 16px;
  display: grid;
  gap: 12px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.set-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px var(--vtix-shadow-strong);
}

.set-card.active {
  border-color: var(--vtix-primary-600);
  box-shadow: 0 16px 34px var(--vtix-shadow-accent);
  background: linear-gradient(180deg, var(--vtix-primary-50) 0%, var(--vtix-surface) 40%);
}

.set-card.disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.set-card.disabled:hover {
  transform: none;
  box-shadow: 0 12px 24px var(--vtix-shadow);
}

.set-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.set-tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.set-public-tag {
  white-space: nowrap;
}

.set-online-tag {
  white-space: nowrap;
  background: var(--vtix-danger-solid) !important;
  border-color: var(--vtix-danger-solid) !important;
  color: var(--vtix-inverse-text) !important;
}

.set-title {
  font-weight: 700;
  font-size: 18px;
  color: var(--vtix-text-strong);
  line-height: 1.4;
  min-height: 0;
  flex: 1;
}

.set-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.set-stat {
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.stat-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--vtix-text-strong);
  line-height: 1;
}

.set-meta {
  border-top: 1px solid var(--vtix-border);
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.meta-value {
  font-size: 13px;
  color: var(--vtix-text-muted);
}

.pagination {
  display: flex;
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

.battle-progress-panel {
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
  display: grid;
  gap: 10px;
}

.progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.progress-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.progress-meta {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.progress-score-inline {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-weight: 800;
  line-height: 1;
}

.progress-score-inline .self {
  font-size: 30px;
  color: var(--vtix-info-solid);
}

.progress-score-inline .sep {
  font-size: 20px;
  color: var(--vtix-text-subtle);
}

.progress-score-inline .opponent {
  font-size: 30px;
  color: var(--vtix-danger-solid);
}

.progress-track {
  position: relative;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--vtix-surface-3);
  border: 1px solid var(--vtix-border-strong);
}

.progress-track-self {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #0ea5e9, #38bdf8);
}

.progress-track-opponent {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #fda4af, #ef4444);
}

.progress-track-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.progress-opponent-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.opponent-disconnect-tag {
  white-space: nowrap;
  font-weight: 700;
  background: var(--vtix-danger-solid) !important;
  border-color: var(--vtix-danger-solid) !important;
  color: var(--vtix-inverse-text) !important;
}

.round-intro-text {
  font-size: clamp(32px, 5.6vw, 56px);
  font-weight: 900;
  color: var(--vtix-text-strong);
  line-height: 1.08;
}

.round-intro-text.is-correct {
  color: var(--vtix-success-solid);
}

.round-intro-text.is-wrong {
  color: var(--vtix-danger-solid);
}

.round-intro-sub {
  font-size: 26px;
  font-weight: 700;
  color: var(--vtix-text-muted);
}

.question-panel {
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 14px 26px var(--vtix-shadow);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.question-stage-panel {
  position: relative;
  min-height: 320px;
}

.question-wait-state {
  flex: 1;
  min-height: 240px;
  display: grid;
  place-items: center;
  text-align: center;
}

.question-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.question-overlay-mask {
  position: absolute;
  inset: 0;
  background: var(--vtix-surface);
  opacity: 0.88;
  border-radius: inherit;
}

.question-overlay-text {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 18px;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 320ms ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
}

.question-content {
  color: var(--vtix-text-strong);
  font-size: 18px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.question-no {
  margin-right: 6px;
  color: var(--vtix-text-muted);
}

.question-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  color: var(--vtix-text-strong);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.choice-row:hover {
  background: var(--vtix-surface-5);
  border-color: var(--vtix-border);
}

.choice-row.chosen {
  background: var(--vtix-surface-4);
  border-color: var(--vtix-info-solid);
}

.choice-row.locked {
  opacity: 0.72;
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

.choice-label {
  flex: 1;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.choice-prefix {
  color: var(--vtix-text-muted);
  font-weight: 700;
}

.submit-row {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.submit-hint {
  font-size: 13px;
  color: var(--vtix-text-muted);
}

.result-card {
  width: 100%;
  border: 1px solid var(--vtix-info-border);
  background: var(--vtix-surface);
  border-radius: 16px;
  padding: 22px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 14px 26px var(--vtix-shadow);
}

.result-status {
  display: inline-flex;
  align-self: center;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid var(--vtix-info-border);
  background: var(--vtix-info-bg);
  color: var(--vtix-info-text);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.result-card h2 {
  margin: 0;
}

.result-score {
  font-size: 30px;
  font-weight: 800;
}

.result-sub {
  color: var(--vtix-text-muted);
}

@media (max-width: 1000px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .set-stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-actions {
    width: 100%;
  }

  .page-actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }

  .cards {
    grid-template-columns: 1fr;
  }

  .selected-hero {
    min-height: 420px;
  }

  .selected-actions {
    width: 100%;
  }

  .selected-actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }

  .progress-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .progress-track-meta {
    flex-direction: column;
    gap: 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-switch-enter-active,
  .stage-switch-leave-active,
  .lobby-switch-enter-active,
  .lobby-switch-leave-active,
  .overlay-fade-enter-active,
  .overlay-fade-leave-active,
  .brawl-card-enter-active,
  .brawl-card-leave-active,
  .brawl-card-move {
    transition: none !important;
  }
}
</style>
