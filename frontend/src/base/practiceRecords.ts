import { getVtixStorage, type VtixStorageLike } from './vtixGlobal'

export type PracticeRecordBase = {
  id: string
  updatedAt?: number
  deletedAt?: number
  [key: string]: unknown
}

export type PracticeRecordWriteFailure = {
  id: string
  reason: string
}

export type PracticeRecordWriteResult<T extends PracticeRecordBase> = {
  normalized: T[]
  failures: PracticeRecordWriteFailure[]
  indexError: string | null
}

type RecordIndexItem = {
  id: string
  updatedAt: number
  deletedAt?: number
}

type RecordIndexPayload = {
  version: number
  items: RecordIndexItem[]
}

const LEGACY_KEY = 'vtixSave'
const INDEX_KEY = 'vtixRecordIndex'
const RECORD_PREFIX = 'vtixRecord:'
const INDEX_VERSION = 1

function getStorage() {
  return getVtixStorage()
}

function toTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'unknown storage error'
}

function normalizeRecord<T extends PracticeRecordBase>(record: T) {
  const updatedAt = toTimestamp(record.updatedAt)
  const deletedAt = toTimestamp(record.deletedAt)
  const finalUpdatedAt = updatedAt || deletedAt || Date.now()
  return {
    ...record,
    updatedAt: finalUpdatedAt,
    ...(deletedAt > 0 ? { deletedAt } : {})
  } as T
}

function toIndexItem(record: PracticeRecordBase): RecordIndexItem {
  const updatedAt = toTimestamp(record.updatedAt) || toTimestamp(record.deletedAt) || 0
  const deletedAt = toTimestamp(record.deletedAt)
  return {
    id: record.id,
    updatedAt,
    ...(deletedAt > 0 ? { deletedAt } : {})
  }
}

function recordKey(id: string) {
  return `${RECORD_PREFIX}${id}`
}

function normalizeIndex(items: RecordIndexItem[]) {
  const map = new Map<string, RecordIndexItem>()
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id) continue
    const updatedAt = toTimestamp(item.updatedAt)
    if (!map.has(item.id) || updatedAt >= (map.get(item.id)?.updatedAt ?? 0)) {
      const deletedAt = toTimestamp(item.deletedAt)
      map.set(item.id, {
        id: item.id,
        updatedAt,
        ...(deletedAt > 0 ? { deletedAt } : {})
      })
    }
  }
  return Array.from(map.values())
}

function readIndex(storage: VtixStorageLike) {
  const raw = storage.getItem(INDEX_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as RecordIndexPayload
    if (!parsed || parsed.version !== INDEX_VERSION || !Array.isArray(parsed.items)) return null
    return normalizeIndex(parsed.items)
  } catch {
    return null
  }
}

function writeIndex(storage: VtixStorageLike, items: RecordIndexItem[]) {
  const payload: RecordIndexPayload = {
    version: INDEX_VERSION,
    items
  }
  storage.setItem(INDEX_KEY, JSON.stringify(payload))
}

function readLegacyRecords(storage: VtixStorageLike): PracticeRecordBase[] {
  const raw = storage.getItem(LEGACY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.id === 'string')
  } catch {
    return []
  }
}

function migrateLegacyRecords(storage: VtixStorageLike) {
  const legacy = readLegacyRecords(storage)
  if (!legacy.length) return [] as RecordIndexItem[]
  const items: RecordIndexItem[] = []
  for (const record of legacy) {
    const normalized = normalizeRecord(record)
    try {
      storage.setItem(recordKey(normalized.id), JSON.stringify(normalized))
      items.push(toIndexItem(normalized))
    } catch {
      // If storage is full, keep legacy data intact.
      return normalizeIndex(items)
    }
  }
  const normalized = normalizeIndex(items)
  writeIndex(storage, normalized)
  storage.removeItem(LEGACY_KEY)
  return normalized
}

function ensureIndex(storage: VtixStorageLike) {
  const existing = readIndex(storage)
  if (existing) return existing
  const migrated = migrateLegacyRecords(storage)
  if (migrated.length > 0) return migrated
  return []
}

function sortIndexDesc(items: RecordIndexItem[]) {
  return [...items].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function getPracticeRecordCount(options: { includeDeleted?: boolean } = {}) {
  const storage = getStorage()
  if (!storage) return 0
  const includeDeleted = Boolean(options.includeDeleted)
  const items = ensureIndex(storage)
  if (includeDeleted) return items.length
  return items.filter((item) => !(item.deletedAt && item.deletedAt > 0)).length
}

export function readPracticeRecordById<T extends PracticeRecordBase>(id: string) {
  const storage = getStorage()
  if (!storage || !id) return null
  const raw = storage.getItem(recordKey(id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed as T
  } catch {
    return null
  }
}

export function readPracticeRecords<T extends PracticeRecordBase>(
  options: { includeDeleted?: boolean } = {}
) {
  const storage = getStorage()
  if (!storage) return [] as T[]
  const includeDeleted = Boolean(options.includeDeleted)
  const items = sortIndexDesc(ensureIndex(storage))
  const nextItems: RecordIndexItem[] = []
  const records: T[] = []
  for (const item of items) {
    if (!includeDeleted && item.deletedAt && item.deletedAt > 0) {
      nextItems.push(item)
      continue
    }
    const record = readPracticeRecordById<T>(item.id)
    if (!record) continue
    records.push(record)
    nextItems.push(item)
  }
  if (nextItems.length !== items.length) {
    writeIndex(storage, normalizeIndex(nextItems))
  }
  return records
}

export function readPracticeRecordPage<T extends PracticeRecordBase>(
  page: number,
  pageSize: number,
  options: { includeDeleted?: boolean } = {}
) {
  const storage = getStorage()
  if (!storage) {
    return { total: 0, records: [] as T[] }
  }
  const includeDeleted = Boolean(options.includeDeleted)
  const items = sortIndexDesc(ensureIndex(storage)).filter(
    (item) => includeDeleted || !(item.deletedAt && item.deletedAt > 0)
  )
  const total = items.length
  const safePage = Math.max(1, Math.floor(page))
  const size = Math.max(1, Math.floor(pageSize))
  const start = (safePage - 1) * size
  const pageItems = items.slice(start, start + size)
  const records: T[] = []
  const missing: RecordIndexItem[] = []
  for (const item of pageItems) {
    const record = readPracticeRecordById<T>(item.id)
    if (!record) {
      missing.push(item)
      continue
    }
    records.push(record)
  }
  if (missing.length > 0) {
    const nextItems = items.filter((item) => !missing.includes(item))
    writeIndex(storage, normalizeIndex(nextItems))
  }
  return { total, records }
}

export function upsertPracticeRecordsWithResult<T extends PracticeRecordBase>(records: T[]) {
  const storage = getStorage()
  if (!storage || !records.length) {
    return {
      normalized: [] as T[],
      failures: [] as PracticeRecordWriteFailure[],
      indexError: null
    }
  }
  const items = ensureIndex(storage)
  const map = new Map(items.map((item) => [item.id, item]))
  const normalized: T[] = []
  const failures: PracticeRecordWriteFailure[] = []
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id) continue
    const normalizedRecord = normalizeRecord(record)
    normalized.push(normalizedRecord)
    try {
      storage.setItem(recordKey(normalizedRecord.id), JSON.stringify(normalizedRecord))
      map.set(normalizedRecord.id, toIndexItem(normalizedRecord))
    } catch (error) {
      failures.push({
        id: normalizedRecord.id,
        reason: toErrorMessage(error)
      })
    }
  }
  let indexError: string | null = null
  try {
    writeIndex(storage, normalizeIndex(Array.from(map.values())))
  } catch (error) {
    indexError = toErrorMessage(error)
  }
  return {
    normalized,
    failures,
    indexError
  }
}

export function upsertPracticeRecords<T extends PracticeRecordBase>(records: T[]) {
  return upsertPracticeRecordsWithResult(records).normalized
}

export function upsertPracticeRecord<T extends PracticeRecordBase>(record: T) {
  const list = upsertPracticeRecords([record])
  return list[0] ?? null
}

export function markPracticeRecordDeleted(recordId: string, timestamp = Date.now()) {
  if (!recordId) return null
  const deleted = {
    id: recordId,
    updatedAt: timestamp,
    deletedAt: timestamp
  } as PracticeRecordBase
  upsertPracticeRecord(deleted)
  return deleted
}

export function writePracticeRecords<T extends PracticeRecordBase>(records: T[]) {
  const storage = getStorage()
  if (!storage) return
  try {
    const index = normalizeIndex(records.map((record) => toIndexItem(normalizeRecord(record))))
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !record.id) continue
      const normalized = normalizeRecord(record)
      storage.setItem(recordKey(normalized.id), JSON.stringify(normalized))
    }
    writeIndex(storage, index)
    storage.removeItem(LEGACY_KEY)
  } catch {
    // Ignore storage write errors.
  }
}
