import type { VtixStorageLike } from './vtixGlobal'

export type RecordBase = {
  id: string
  updatedAt?: number
  [key: string]: unknown
}

export type MergeResult<T extends RecordBase> = {
  merged: T[]
  conflicts: number
  localNewer: number
  remoteNewer: number
  trimmed: number
}

export type SyncResult<T extends RecordBase> = {
  finalRecords: T[]
  merged: T[]
  remoteRecords: T[]
  localDelta: T[]
  cursor: number
  localChanged: boolean
  conflicts: number
  localNewer: number
  remoteNewer: number
  uploaded: boolean
  downloaded: number
  trimmed: number
  cloudLimit?: number
  savedCount?: number
  noOp: boolean
}

export const RECORD_SYNC_AT_KEY = 'vtixLastCloudSyncAt'
export const RECORD_SYNC_CURSOR_KEY = 'vtixRecordSyncCursor'
export const DEFAULT_MAX_RECORDS = 10

type SyncStorageLike = Pick<VtixStorageLike, 'getItem' | 'setItem'>

function normalizeSyncScope(scope?: string) {
  return typeof scope === 'string' ? scope.trim() : ''
}

function getScopedSyncKey(baseKey: string, scope?: string) {
  const safeScope = normalizeSyncScope(scope)
  return safeScope ? `${baseKey}:${safeScope}` : baseKey
}

function normalizeLimit(value?: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.floor(parsed)
}

function toUpdatedAt(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toSafeNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function getSyncCursor(storage: SyncStorageLike | null | undefined, scope?: string) {
  if (!storage) return 0
  const scopedKey = getScopedSyncKey(RECORD_SYNC_CURSOR_KEY, scope)
  let value = toSafeNumber(storage.getItem(scopedKey))
  if ((value <= 0 || !Number.isFinite(value)) && normalizeSyncScope(scope)) {
    value = toSafeNumber(storage.getItem(RECORD_SYNC_CURSOR_KEY))
  }
  if (value > 1e12) {
    return 0
  }
  return value
}

export function setSyncCursor(
  storage: SyncStorageLike | null | undefined,
  cursor: number,
  scope?: string
) {
  if (!storage) return
  if (!Number.isFinite(cursor) || cursor <= 0) return
  storage.setItem(getScopedSyncKey(RECORD_SYNC_CURSOR_KEY, scope), String(cursor))
}

export function getSyncAt(storage: SyncStorageLike | null | undefined, scope?: string) {
  if (!storage) return 0
  const scopedKey = getScopedSyncKey(RECORD_SYNC_AT_KEY, scope)
  let value = toSafeNumber(storage.getItem(scopedKey))
  if ((value <= 0 || !Number.isFinite(value)) && normalizeSyncScope(scope)) {
    value = toSafeNumber(storage.getItem(RECORD_SYNC_AT_KEY))
  }
  return value
}

export function setSyncAt(
  storage: SyncStorageLike | null | undefined,
  timestamp: number,
  scope?: string
) {
  if (!storage) return
  if (!Number.isFinite(timestamp) || timestamp <= 0) return
  storage.setItem(getScopedSyncKey(RECORD_SYNC_AT_KEY, scope), String(timestamp))
}

export function normalizeRecords<T extends RecordBase>(list: T[]) {
  return list
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => {
      const updatedAt = toUpdatedAt(item.updatedAt)
      const deletedAt = toUpdatedAt((item as { deletedAt?: unknown }).deletedAt)
      return {
        ...item,
        updatedAt: updatedAt || (deletedAt > 0 ? deletedAt : 0),
        ...(deletedAt > 0 ? { deletedAt } : {})
      }
    }) as T[]
}

export function serializeRecords<T extends RecordBase>(list: T[]) {
  return JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)))
}

export function getMaxUpdatedAt<T extends RecordBase>(list: T[]) {
  return list.reduce((max, item) => Math.max(max, item.updatedAt ?? 0), 0)
}

export function getRecordQuality(record: RecordBase) {
  if (
    typeof record.deletedAt === 'number' &&
    Number(record.deletedAt) > 0
  ) {
    return 0
  }
  const progress = record.progress as { problemList?: unknown[] } | undefined
  const hasProgress = Boolean(progress && Array.isArray(progress.problemList))
  const testId = record.testId
  const hasTestId = typeof testId === 'string' && testId.length > 0
  return (hasProgress ? 2 : 0) + (hasTestId ? 1 : 0)
}

function isDeletedRecord(record: RecordBase) {
  return typeof record.deletedAt === 'number' && Number(record.deletedAt) > 0
}

function dedupeLatestRecords<T extends RecordBase>(records: T[]) {
  const map = new Map<string, T>()
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id) continue
    const prev = map.get(record.id)
    if (!prev || (record.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) {
      map.set(record.id, record)
    }
  }
  return Array.from(map.values())
}

function toUploadWithinLimit<T extends RecordBase>(records: T[], limit: number) {
  if (!records.length) return [] as T[]
  const sorted = records.slice().sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
  if (!Number.isFinite(limit) || limit <= 0) return sorted
  if (sorted.length <= limit) return sorted
  return sorted.slice(Math.max(0, sorted.length - limit))
}

export function mergeByUpdatedAt<T extends RecordBase>(
  local: T[],
  remote: T[],
  maxRecords = DEFAULT_MAX_RECORDS
): MergeResult<T> {
  const localMap = new Map(local.map((item) => [item.id, item]))
  const remoteMap = new Map(remote.map((item) => [item.id, item]))
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()])
  const merged: T[] = []
  let conflicts = 0
  let localNewer = 0
  let remoteNewer = 0
  for (const id of ids) {
    const localItem = localMap.get(id)
    const remoteItem = remoteMap.get(id)
    if (localItem && remoteItem) {
      const localDeleted = isDeletedRecord(localItem)
      const remoteDeleted = isDeletedRecord(remoteItem)
      if (localDeleted || remoteDeleted) {
        const localTime = localItem.updatedAt ?? 0
        const remoteTime = remoteItem.updatedAt ?? 0
        if (localTime >= remoteTime) {
          merged.push(localItem)
          if (localTime > remoteTime) localNewer += 1
        } else {
          merged.push(remoteItem)
          remoteNewer += 1
        }
        continue
      }
      const localQuality = getRecordQuality(localItem)
      const remoteQuality = getRecordQuality(remoteItem)
      if (localQuality !== remoteQuality) {
        if (localQuality > remoteQuality) {
          merged.push(localItem)
          localNewer += 1
        } else {
          merged.push(remoteItem)
          remoteNewer += 1
        }
        continue
      }
      if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
        conflicts += 1
      }
      const localTime = localItem.updatedAt ?? 0
      const remoteTime = remoteItem.updatedAt ?? 0
      if (localTime >= remoteTime) {
        merged.push(localItem)
        if (localTime > remoteTime) localNewer += 1
      } else {
        merged.push(remoteItem)
        remoteNewer += 1
      }
    } else if (localItem) {
      merged.push(localItem)
      localNewer += 1
    } else if (remoteItem) {
      merged.push(remoteItem)
      remoteNewer += 1
    }
  }
  const total = merged.length
  const limit = normalizeLimit(maxRecords)
  const trimmed = Number.isFinite(limit) ? Math.max(0, total - limit) : 0
  const sorted = merged.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
  const trimmedMerged = Number.isFinite(limit)
    ? sorted.slice(Math.max(0, total - limit))
    : sorted
  return { merged: trimmedMerged, conflicts, localNewer, remoteNewer, trimmed }
}

function recordsEqual<T extends RecordBase>(left: T[], right: T[]) {
  return serializeRecords(left) === serializeRecords(right)
}

export async function syncRecords<T extends RecordBase>(options: {
  apiBase: string
  localRecords: T[]
  since?: number
  localSince?: number
  fetchImpl?: typeof fetch
  credentials?: RequestCredentials
  maxRecords?: number
  trimLocal?: boolean
}): Promise<SyncResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch
  const credentials = options.credentials ?? 'include'
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS
  const limit = normalizeLimit(maxRecords)
  const trimLocal = options.trimLocal ?? true
  const localRecords = normalizeRecords(options.localRecords)
  const since =
    typeof options.since === 'number' && Number.isFinite(options.since) && options.since > 0
      ? options.since
      : 0
  const localSince =
    typeof options.localSince === 'number' && Number.isFinite(options.localSince)
      ? options.localSince
      : 0
  const localActiveCount = localRecords.filter((record) => !isDeletedRecord(record)).length
  const localDelta =
    localSince > 0
      ? localRecords.filter((record) => (record.updatedAt ?? 0) >= localSince)
      : localRecords
  const baseUploadRecords =
    Number.isFinite(limit) && localSince <= 0 && localDelta.length > limit
      ? localDelta
          .slice()
          .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
          .slice(Math.max(0, localDelta.length - limit))
      : localDelta
  const deletedDeltaCount = localDelta.filter((record) => isDeletedRecord(record)).length
  const uploadRecords =
    Number.isFinite(limit) &&
    limit > 0 &&
    deletedDeltaCount > 0 &&
    localActiveCount >= limit
      ? dedupeLatestRecords(
          baseUploadRecords.concat(
            localRecords
              .filter((record) => !isDeletedRecord(record))
              .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
              .slice(0, Math.floor(limit))
          )
        ).sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
      : baseUploadRecords

  async function parseSyncResponseError(response: Response) {
    let detail = ''
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        detail = payload.error.trim()
      } else {
        const text = JSON.stringify(payload)
        if (text && text !== '{}') {
          detail = text
        }
      }
    } catch {
      try {
        const text = (await response.text()).trim()
        if (text) detail = text
      } catch {
        // ignore
      }
    }
    return detail
  }

  type SyncResponsePayload = {
    records?: T[]
    cursor?: number
    trimmed?: number
    limit?: number
    savedCount?: number
  }
  function parseSyncResponse(data: SyncResponsePayload) {
    const remoteRecords = normalizeRecords(Array.isArray(data.records) ? data.records : [])
    const serverCursor =
      typeof data.cursor === 'number' && Number.isFinite(data.cursor) ? data.cursor : since
    const serverTrimmed =
      typeof data.trimmed === 'number' && Number.isFinite(data.trimmed) ? data.trimmed : 0
    const cloudLimit =
      typeof data.limit === 'number' && Number.isFinite(data.limit) ? data.limit : undefined
    const savedCount =
      typeof data.savedCount === 'number' && Number.isFinite(data.savedCount)
        ? Math.max(0, Math.floor(data.savedCount))
        : undefined
    return { remoteRecords, serverCursor, serverTrimmed, cloudLimit, savedCount }
  }

  let effectiveUploadRecords = uploadRecords
  const initialResponse = await fetchImpl(`${options.apiBase}/api/records/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials,
    body: JSON.stringify({ since, records: effectiveUploadRecords })
  })
  if (!initialResponse.ok) {
    const detail = await parseSyncResponseError(initialResponse)
    throw new Error(detail ? `同步失败: ${initialResponse.status} (${detail})` : `同步失败: ${initialResponse.status}`)
  }
  let responsePayload = (await initialResponse.json()) as SyncResponsePayload
  let { remoteRecords, serverCursor, serverTrimmed, cloudLimit, savedCount } =
    parseSyncResponse(responsePayload)

  const localActiveRecords = localRecords.filter((record) => !isDeletedRecord(record))
  const shouldBootstrapUpload =
    effectiveUploadRecords.length === 0 &&
    localActiveRecords.length > 0 &&
    remoteRecords.length === 0 &&
    savedCount === 0
  if (shouldBootstrapUpload) {
    const bootstrapUploadRecords = toUploadWithinLimit(localActiveRecords, limit)
    if (bootstrapUploadRecords.length > 0) {
      const retryResponse = await fetchImpl(`${options.apiBase}/api/records/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials,
        body: JSON.stringify({ since, records: bootstrapUploadRecords })
      })
      if (!retryResponse.ok) {
        const detail = await parseSyncResponseError(retryResponse)
        throw new Error(detail ? `同步失败: ${retryResponse.status} (${detail})` : `同步失败: ${retryResponse.status}`)
      }
      responsePayload = (await retryResponse.json()) as SyncResponsePayload
      const parsed = parseSyncResponse(responsePayload)
      remoteRecords = parsed.remoteRecords
      serverCursor = parsed.serverCursor
      serverTrimmed = parsed.serverTrimmed
      cloudLimit = parsed.cloudLimit
      savedCount = parsed.savedCount
      effectiveUploadRecords = bootstrapUploadRecords
    }
  }

  const { merged, conflicts, localNewer, remoteNewer, trimmed } = mergeByUpdatedAt(
    localRecords,
    remoteRecords,
    trimLocal ? maxRecords : Number.POSITIVE_INFINITY
  )

  let finalRecords = merged
  let uploaded = false
  if (effectiveUploadRecords.length > 0) {
    uploaded = true
  }

  const localChanged = !recordsEqual(finalRecords, localRecords)
  const cursor = Math.max(serverCursor, since)
  const downloaded = remoteRecords.length
  const trimmedCount = trimLocal ? trimmed : serverTrimmed
  const noOp = !uploaded && downloaded === 0 && !localChanged && trimmedCount === 0

  return {
    finalRecords,
    merged,
    remoteRecords,
    localDelta: effectiveUploadRecords,
    cursor,
    localChanged,
    conflicts,
    localNewer,
    remoteNewer,
    uploaded,
    downloaded,
    trimmed: trimmedCount,
    cloudLimit,
    savedCount,
    noOp
  }
}
