import type { ProblemType } from './ProblemTypes'
import { getStorageItem, setStorageItem } from './vtixGlobal'

export type CachedProblemExplanation = {
  explanation: string
  model?: string
  updatedAt: number
}

const STORAGE_KEY = 'vtixProblemExplanations'
const MAX_CACHE_SIZE = 200

function readCache(): Record<string, CachedProblemExplanation> {
  const raw = getStorageItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, CachedProblemExplanation>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, CachedProblemExplanation>) {
  const entries = Object.entries(cache)
    .filter(([, value]) => typeof value?.explanation === 'string' && value.explanation.trim())
    .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
    .slice(0, MAX_CACHE_SIZE)
  setStorageItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
}

function buildProblemSignature(problem: ProblemType) {
  const choices = 'choices' in problem ? problem.choices.join('|') : ''
  const answer = Array.isArray(problem.answer) ? problem.answer.join(',') : String(problem.answer ?? '')
  return `${problem.type}|${problem.content}|${choices}|${answer}`
}

export function buildProblemExplanationKey(testId: string, problem: ProblemType) {
  return `${testId}::${buildProblemSignature(problem)}`
}

export function getCachedProblemExplanation(key: string) {
  if (!key) return null
  return readCache()[key] ?? null
}

export function setCachedProblemExplanation(
  key: string,
  value: Omit<CachedProblemExplanation, 'updatedAt'> & { updatedAt?: number }
) {
  if (!key || !value.explanation.trim()) return null
  const cache = readCache()
  const next: CachedProblemExplanation = {
    explanation: value.explanation.trim(),
    model: value.model,
    updatedAt: value.updatedAt ?? Date.now()
  }
  cache[key] = next
  writeCache(cache)
  return next
}
