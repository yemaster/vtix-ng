import { getVtixStorage, type VtixStorageLike } from './vtixGlobal'

export type CachedProblemSetSummary = {
  code: string
  title: string
  year: number
  categories: string[]
  questionCount: number
  creatorId: string
  creatorName: string
  recommendedRank: number | null
  createdAt: number
  updatedAt: number
}

const INDEX_KEY = 'vtixProblemSetCacheIndex'
const DETAIL_PREFIX = 'vtixProblemSetCache:'

function getStorage() {
  return getVtixStorage()
}

function detailKey(code: string) {
  return `${DETAIL_PREFIX}${code}`
}

function toSafeNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function normalizeSummary(input: unknown): CachedProblemSetSummary | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const code = typeof row.code === 'string' ? row.code.trim() : ''
  if (!code) return null
  const title = typeof row.title === 'string' ? row.title : code
  const year = Math.max(0, Math.floor(toSafeNumber(row.year, 0)))
  const categories = Array.isArray(row.categories)
    ? row.categories.map((item) => String(item)).filter(Boolean)
    : []
  const questionCount = Math.max(0, Math.floor(toSafeNumber(row.questionCount, 0)))
  const creatorId = typeof row.creatorId === 'string' ? row.creatorId : ''
  const creatorName = typeof row.creatorName === 'string' ? row.creatorName : creatorId
  const recommendedRankRaw = toSafeNumber(row.recommendedRank, NaN)
  const recommendedRank = Number.isFinite(recommendedRankRaw) ? recommendedRankRaw : null
  const createdAt = Math.max(0, toSafeNumber(row.createdAt, 0))
  const updatedAt = Math.max(
    0,
    toSafeNumber(row.updatedAt, 0) || createdAt
  )
  return {
    code,
    title,
    year,
    categories,
    questionCount,
    creatorId,
    creatorName,
    recommendedRank,
    createdAt,
    updatedAt
  }
}

function sortSummaries(items: CachedProblemSetSummary[]) {
  return items.sort((a, b) => {
    const aRec = a.recommendedRank !== null
    const bRec = b.recommendedRank !== null
    if (aRec !== bRec) return aRec ? -1 : 1
    if (a.recommendedRank !== null && b.recommendedRank !== null && a.recommendedRank !== b.recommendedRank) {
      return a.recommendedRank - b.recommendedRank
    }
    if (a.year !== b.year) return b.year - a.year
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
    return a.title.localeCompare(b.title, 'zh-Hans-CN')
  })
}

function readIndex(storage: VtixStorageLike) {
  try {
    const raw = storage.getItem(INDEX_KEY)
    if (!raw) return [] as CachedProblemSetSummary[]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [] as CachedProblemSetSummary[]
    return sortSummaries(
      parsed
        .map((item) => normalizeSummary(item))
        .filter((item): item is CachedProblemSetSummary => Boolean(item))
    )
  } catch {
    return [] as CachedProblemSetSummary[]
  }
}

function writeIndex(storage: VtixStorageLike, items: CachedProblemSetSummary[]) {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(sortSummaries(items)))
  } catch {
    // ignore quota and serialization errors
  }
}

function upsertSummary(storage: VtixStorageLike, summary: CachedProblemSetSummary) {
  const items = readIndex(storage)
  const map = new Map(items.map((item) => [item.code, item]))
  map.set(summary.code, summary)
  writeIndex(storage, Array.from(map.values()))
}

export function readCachedProblemSetDetail<T = Record<string, unknown>>(code: string): T | null {
  if (!code) return null
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(detailKey(code))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeCachedProblemSetDetail(detail: unknown) {
  const storage = getStorage()
  if (!storage) return null
  const summary = normalizeSummary(detail)
  if (!summary) return null
  try {
    storage.setItem(detailKey(summary.code), JSON.stringify(detail))
  } catch {
    return null
  }
  upsertSummary(storage, summary)
  return summary
}

export function upsertCachedProblemSetSummaries(list: unknown[]) {
  const storage = getStorage()
  if (!storage || !Array.isArray(list)) return
  const items = readIndex(storage)
  const map = new Map(items.map((item) => [item.code, item]))
  for (const row of list) {
    const summary = normalizeSummary(row)
    if (!summary) continue
    map.set(summary.code, summary)
  }
  writeIndex(storage, Array.from(map.values()))
}

export function getCachedProblemSetUpdatedAt(code: string) {
  const detail = readCachedProblemSetDetail<Record<string, unknown>>(code)
  if (detail && typeof detail === 'object') {
    const updatedAt = Math.max(
      0,
      toSafeNumber((detail as Record<string, unknown>).updatedAt, 0) ||
      toSafeNumber((detail as Record<string, unknown>).createdAt, 0)
    )
    if (updatedAt > 0) return updatedAt
  }
  const storage = getStorage()
  if (!storage) return 0
  const row = readIndex(storage).find((item) => item.code === code)
  return row?.updatedAt ?? 0
}

export function queryCachedProblemSetSummaries(options?: {
  page?: number
  pageSize?: number
  keyword?: string
  category?: string
}) {
  const storage = getStorage()
  if (!storage) {
    return { items: [] as CachedProblemSetSummary[], total: 0 }
  }
  const keyword = String(options?.keyword ?? '').trim().toLowerCase()
  const category = String(options?.category ?? '').trim()
  const pageRaw = Math.floor(toSafeNumber(options?.page, 1))
  const pageSizeRaw = Math.floor(toSafeNumber(options?.pageSize, 12))
  const page = Math.max(1, pageRaw || 1)
  const pageSize = Math.max(1, pageSizeRaw || 12)

  let filtered = readIndex(storage)
  if (keyword) {
    filtered = filtered.filter((item) => {
      const haystack = `${item.title} ${item.code} ${item.year} ${item.creatorName}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }
  if (category && category !== '全部' && category !== 'all') {
    filtered = filtered.filter((item) => item.categories.includes(category))
  }
  const total = filtered.length
  const offset = (page - 1) * pageSize
  return {
    items: filtered.slice(offset, offset + pageSize),
    total
  }
}
