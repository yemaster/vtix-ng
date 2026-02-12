import type { ProblemType } from './ProblemTypes'
import { getStorageItem, setStorageItem } from './vtixGlobal'

export type WrongProblemRecord = {
  id: string
  key: string
  userId: string
  testId: string
  testTitle: string
  problem: ProblemType
  userAnswer: (number | string)[] | null
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'vtixWrongProblems'

function normalizeUserId(raw: unknown) {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return ''
}

function readWrongProblems(): WrongProblemRecord[] {
  const raw = getStorageItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        if (typeof item.id !== 'string') return null
        const userId = normalizeUserId((item as { userId?: unknown }).userId)
        if (!userId) return null
        return { ...item, userId } as WrongProblemRecord
      })
      .filter((item): item is WrongProblemRecord => Boolean(item?.id && item?.userId))
  } catch (error) {
    return []
  }
}

function writeWrongProblems(records: WrongProblemRecord[]) {
  setStorageItem(STORAGE_KEY, JSON.stringify(records))
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function buildProblemSignature(problem: ProblemType) {
  const base = `${problem.type}|${problem.content}`
  const choices = 'choices' in problem ? problem.choices.join('|') : ''
  const answer = Array.isArray(problem.answer) ? problem.answer.join(',') : String(problem.answer ?? '')
  return `${base}|${choices}|${answer}`
}

export function buildWrongProblemKey(testId: string, problem: ProblemType) {
  return `${testId}::${buildProblemSignature(problem)}`
}

export function addWrongProblem(params: {
  userId: string
  testId: string
  testTitle: string
  problem: ProblemType
  userAnswer: (number | string)[] | null
}) {
  const records = readWrongProblems()
  const userId = normalizeUserId(params.userId) || 'guest'
  const key = buildWrongProblemKey(params.testId, params.problem)
  const now = Date.now()
  const existing = records.find((item) => item.userId === userId && item.key === key)
  if (existing) {
    existing.userAnswer = params.userAnswer
    existing.updatedAt = now
    if (!existing.testTitle) {
      existing.testTitle = params.testTitle
    }
    existing.problem = params.problem
    writeWrongProblems(records)
    return existing
  }
  const record: WrongProblemRecord = {
    id: createId(),
    key,
    userId,
    testId: params.testId,
    testTitle: params.testTitle,
    problem: params.problem,
    userAnswer: params.userAnswer,
    createdAt: now,
    updatedAt: now
  }
  records.push(record)
  writeWrongProblems(records)
  return record
}

export function getWrongProblemsByUser(userId: string) {
  const target = normalizeUserId(userId)
  if (!target) return []
  return readWrongProblems().filter((record) => record.userId === target)
}

export function getWrongProblemsByTest(userId: string, testId: string) {
  const target = normalizeUserId(userId)
  if (!target) return []
  return readWrongProblems().filter((record) => record.userId === target && record.testId === testId)
}

export function removeWrongProblemsByIds(userId: string, ids: string[]) {
  if (!ids.length) return []
  const set = new Set(ids)
  const target = normalizeUserId(userId)
  const next = readWrongProblems().filter((record) => record.userId !== target || !set.has(record.id))
  writeWrongProblems(next)
  return next
}

export function removeAllWrongProblemsByUser(userId: string) {
  const target = normalizeUserId(userId)
  const next = readWrongProblems().filter((record) => record.userId !== target)
  writeWrongProblems(next)
  return next
}

function normalizeWrongProblemRecord(userId: string, raw: any): WrongProblemRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const normalizedUserId = normalizeUserId(userId)
  if (!normalizedUserId) return null
  const testId = typeof raw.testId === 'string' ? raw.testId : ''
  if (!testId || !raw.problem || typeof raw.problem !== 'object') return null
  const problem = raw.problem as ProblemType
  const key = typeof raw.key === 'string' && raw.key ? raw.key : buildWrongProblemKey(testId, problem)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
    key,
    userId: normalizedUserId,
    testId,
    testTitle: typeof raw.testTitle === 'string' ? raw.testTitle : '',
    problem,
    userAnswer: Array.isArray(raw.userAnswer) ? raw.userAnswer : raw.userAnswer ?? null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  }
}

export function mergeWrongProblemsByUser(userId: string, incoming: any[]) {
  const normalizedUserId = normalizeUserId(userId)
  if (!normalizedUserId) return []
  const existing = readWrongProblems()
  const normalized = incoming
    .map((item) => normalizeWrongProblemRecord(normalizedUserId, item))
    .filter((item): item is WrongProblemRecord => Boolean(item?.id && item?.testId))

  const otherUsers = existing.filter((record) => record.userId !== normalizedUserId)
  const ownRecords = existing.filter((record) => record.userId === normalizedUserId)
  const map = new Map<string, WrongProblemRecord>()

  ownRecords.forEach((record) => {
    const key = record.key || buildWrongProblemKey(record.testId, record.problem)
    map.set(key, { ...record, key })
  })

  normalized.forEach((record) => {
    const key = record.key || buildWrongProblemKey(record.testId, record.problem)
    const current = map.get(key)
    if (!current || record.updatedAt >= current.updatedAt) {
      map.set(key, { ...record, key })
    }
  })

  const merged = Array.from(map.values())
  writeWrongProblems(otherUsers.concat(merged))
  return merged.sort((a, b) => b.updatedAt - a.updatedAt)
}
