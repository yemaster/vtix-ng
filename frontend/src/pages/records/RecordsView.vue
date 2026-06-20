<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import Paginator from 'primevue/paginator'
import Tag from 'primevue/tag'
import type { PageState } from 'primevue/paginator'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import {
  getSyncAt,
  getSyncCursor,
  setSyncAt,
  setSyncCursor,
  syncRecords
} from '../../base/recordSync'
import {
  getPracticeRecordCount,
  readPracticeRecordById,
  readPracticeRecordPage,
  readPracticeRecords,
  upsertPracticeRecords
} from '../../base/practiceRecords'
import { getVtixStorage } from '../../base/vtixGlobal'
import { pushLoginRequired } from '../../utils/auth'

type PracticeRecord = {
  id: string
  testId: string
  testTitle?: string
  updatedAt: number
  deletedAt?: number
  practiceMode: number
  progress: {
    timeSpentSeconds?: number
    currentProblemId?: number
    problemList?: unknown[]
    submittedList?: boolean[]
    answerList?: unknown[]
  }
  problemState?: number[]
}

type CloudRecordStatus = {
  exists: boolean
  updatedAt: number | null
}

type ImportConflictAction = 'overwrite' | 'keep-both' | 'skip'

type ImportConflictRow = {
  id: string
  title: string
  mode: string
  updatedAt: number
  duration: string
  progress: string
  existingTitle: string
  existingMode: string
  existingUpdatedAt: number
  existingDuration: string
  existingProgress: string
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const records = ref<PracticeRecord[]>([])
const importInput = ref<HTMLInputElement | null>(null)
const userStore = useUserStore()
const isSyncing = ref(false)
const isImporting = ref(false)
const importConflictVisible = ref(false)
const pendingImportRecords = ref<PracticeRecord[]>([])
const importConflictRows = ref<ImportConflictRow[]>([])
const confirm = useConfirm()
const toast = useToast()
const pageSize = ref(8)
const currentPage = ref(1)
const totalRecords = ref(0)
const cloudStatus = ref<Record<string, CloudRecordStatus | null>>({})
const syncingRecordIds = ref(new Set<string>())
const cloudSavedCount = ref<number | null>(null)
const cloudLimitOverride = ref<number | null>(null)

const modes = [
  { label: '顺序练习', value: 0 },
  { label: '乱序练习', value: 1 },
  { label: '自定义练习', value: 2 },
  { label: '错题回顾', value: 4 },
  { label: '模拟考试', value: 5 }
]

const isImportBusy = computed(() => isImporting.value || importConflictVisible.value)

function syncLocalRecords(page = currentPage.value, forceCloud = false) {
  const total = getPracticeRecordCount()
  totalRecords.value = total
  const totalPages = Math.max(1, Math.ceil(total / pageSize.value))
  const targetPage = Math.min(Math.max(1, page), totalPages)
  currentPage.value = targetPage
  const result = readPracticeRecordPage<PracticeRecord>(targetPage, pageSize.value)
  records.value = result.records
  if (userStore.user) {
    const ids = records.value.map((record) => record.id)
    void refreshCloudStatus(ids, forceCloud || ids.length === 0)
  }
}

function getModeLabel(value?: number | null) {
  if (typeof value !== 'number') return '未知模式'
  return modes.find((item) => item.value === value)?.label ?? '练习'
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

function getRecordTotalCount(record: PracticeRecord) {
  return record.progress?.problemList?.length ?? 0
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

function getRecordProgressPercent(record: PracticeRecord) {
  const total = getRecordTotalCount(record)
  if (!total) return 0
  const answered = getRecordAnsweredCount(record)
  return Math.min(100, Math.round((answered / total) * 100))
}

function formatFileTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}-${hours}${minutes}`
}

function exportAllRecords() {
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    records: readPracticeRecords<PracticeRecord>()
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `vtix-records-all-${formatFileTimestamp(Date.now())}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function exportSingleRecord(record: PracticeRecord) {
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    record
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `vtix-record-${record.testId}-${formatFileTimestamp(Date.now())}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}


async function handleSyncAuto() {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  const storage = getVtixStorage()
  if (!storage) return
  isSyncing.value = true
  try {
    const syncStartedAt = Date.now()
    const syncScope = userStore.user?.id ?? ''
    const localRecords = readPracticeRecords<PracticeRecord>({ includeDeleted: true })
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
    if (typeof result.cloudLimit === 'number' && Number.isFinite(result.cloudLimit)) {
      cloudLimitOverride.value = Math.floor(result.cloudLimit)
    }
    if (typeof result.savedCount === 'number' && Number.isFinite(result.savedCount)) {
      cloudSavedCount.value = Math.max(0, Math.floor(result.savedCount))
    }

    if (result.remoteRecords.length > 0) {
      upsertPracticeRecords(result.remoteRecords)
    }
    syncLocalRecords(currentPage.value, true)
    setSyncCursor(storage, result.cursor, syncScope)
    setSyncAt(storage, syncStartedAt, syncScope)

    const details = result.noOp
      ? '本地与云端已是最新'
      : [
          result.localDelta.length ? `上传 ${result.localDelta.length} 条` : '',
          result.downloaded ? `下载 ${result.downloaded} 条` : '',
          result.conflicts ? `冲突 ${result.conflicts} 条` : '',
          result.trimmed ? `裁剪 ${result.trimmed} 条` : ''
        ]
          .filter(Boolean)
          .join(' · ')

    toast.add({
      severity: 'success',
      summary: '同步完成',
      detail: details || '同步完成',
      life: 3500
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '同步失败',
      life: 4000
    })
  } finally {
    isSyncing.value = false
  }
}

function triggerImport() {
  if (isImportBusy.value) return
  importInput.value?.click()
}

function toRecord(raw: any): PracticeRecord | null {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.progress || !Array.isArray(raw.progress.problemList)) return null
  return {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : '',
    testId: typeof raw.testId === 'string' ? raw.testId : '',
    testTitle: typeof raw.testTitle === 'string' ? raw.testTitle : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : undefined,
    practiceMode: typeof raw.practiceMode === 'number' ? raw.practiceMode : 0,
    progress: raw.progress,
    problemState: Array.isArray(raw.problemState) ? raw.problemState : undefined
  }
}

function applyImportedRecords(incoming: PracticeRecord[]) {
  if (!incoming.length) return []
  upsertPracticeRecords(incoming)
  syncLocalRecords(1)
  return incoming
}

function getRecordTitle(record: PracticeRecord) {
  const title = typeof record.testTitle === 'string' ? record.testTitle.trim() : ''
  if (title) return title
  const testId = typeof record.testId === 'string' ? record.testId.trim() : ''
  return testId ? `题库 ${testId}` : '未知题库'
}

function getRecordProgressText(record: PracticeRecord) {
  return `${getRecordAnsweredCount(record)}/${getRecordTotalCount(record)}`
}

function getImportConflictRows(incoming: PracticeRecord[]) {
  const rows: ImportConflictRow[] = []
  const seen = new Set<string>()
  for (const record of incoming) {
    if (!record.id || seen.has(record.id)) continue
    const existing = readPracticeRecordById<PracticeRecord>(record.id)
    if (!existing) continue
    rows.push({
      id: record.id,
      title: getRecordTitle(record),
      mode: getModeLabel(record.practiceMode),
      updatedAt: record.updatedAt,
      duration: formatDuration(record.progress?.timeSpentSeconds ?? 0),
      progress: getRecordProgressText(record),
      existingTitle: getRecordTitle(existing),
      existingMode: getModeLabel(existing.practiceMode),
      existingUpdatedAt: existing.updatedAt,
      existingDuration: formatDuration(existing.progress?.timeSpentSeconds ?? 0),
      existingProgress: getRecordProgressText(existing)
    })
    seen.add(record.id)
  }
  return rows
}

function splitImportRecords(incoming: PracticeRecord[]) {
  const conflicts = getImportConflictRows(incoming)
  const conflictIds = new Set(conflicts.map((item) => item.id))
  return {
    clearRecords: incoming.filter((record) => !conflictIds.has(record.id)),
    conflictRecords: incoming.filter((record) => conflictIds.has(record.id)),
    conflicts
  }
}

function generateImportedRecordId(existingIds: Set<string>) {
  let id = ''
  do {
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  } while (existingIds.has(id))
  existingIds.add(id)
  return id
}

function buildImportRecordForAction(
  record: PracticeRecord,
  action: ImportConflictAction,
  existingIds: Set<string>
) {
  if (action === 'skip') return null
  if (action === 'keep-both') {
    return {
      ...record,
      id: generateImportedRecordId(existingIds)
    }
  }
  existingIds.add(record.id)
  return record
}

function closeImportConflictDialog(options: { force?: boolean } = {}) {
  if (isImporting.value && !options.force) return
  importConflictVisible.value = false
  pendingImportRecords.value = []
  importConflictRows.value = []
}

function removeImportConflict(id: string) {
  pendingImportRecords.value = pendingImportRecords.value.filter((record) => record.id !== id)
  importConflictRows.value = importConflictRows.value.filter((row) => row.id !== id)
  if (importConflictRows.value.length === 0) {
    closeImportConflictDialog({ force: true })
  }
}

function applyConflictRecord(id: string, action: ImportConflictAction) {
  if (isImporting.value) return
  isImporting.value = true
  try {
    const targetRecords = pendingImportRecords.value.filter((record) => record.id === id)
    if (targetRecords.length > 0) {
      const existingIds = new Set(
        readPracticeRecords<PracticeRecord>({ includeDeleted: true }).map((record) => record.id)
      )
      const resolved = targetRecords
        .map((record) => buildImportRecordForAction(record, action, existingIds))
        .filter((record): record is PracticeRecord => Boolean(record))
      if (resolved.length > 0) {
        applyImportedRecords(resolved)
      }
    }
    removeImportConflict(id)
    if (importConflictRows.value.length === 0) {
      toast.add({
        severity: 'success',
        summary: '导入完成',
        detail: '冲突记录已处理完成',
        life: 3000
      })
    }
  } finally {
    isImporting.value = false
  }
}

function resolveAllImportConflicts(action: ImportConflictAction) {
  isImporting.value = true
  try {
    const total = pendingImportRecords.value.length
    const existingIds = new Set(
      readPracticeRecords<PracticeRecord>({ includeDeleted: true }).map((record) => record.id)
    )
    const resolved = pendingImportRecords.value
      .map((record) => buildImportRecordForAction(record, action, existingIds))
      .filter((record): record is PracticeRecord => Boolean(record))
    if (resolved.length > 0) {
      applyImportedRecords(resolved)
    }
    toast.add({
      severity: action === 'skip' ? 'warn' : 'success',
      summary: action === 'skip' ? '已取消导入' : '导入完成',
      detail: action === 'skip' ? `已取消 ${total} 条冲突记录` : `已处理 ${total} 条冲突记录`,
      life: 3200
    })
    closeImportConflictDialog({ force: true })
  } finally {
    isImporting.value = false
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  isImporting.value = true
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const rawRecords = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
      ? parsed.records
      : parsed?.record
      ? [parsed.record]
      : parsed
      ? [parsed]
      : []
    if (!Array.isArray(rawRecords)) {
      throw new Error('文件中没有可导入的练习记录')
    }
    const incoming = rawRecords
      .map(toRecord)
      .filter((record): record is PracticeRecord => Boolean(record?.id && record?.testId))
    if (!incoming.length) {
      throw new Error('未识别到有效练习记录')
    }
    const { clearRecords, conflictRecords, conflicts } = splitImportRecords(incoming)
    if (clearRecords.length > 0) {
      applyImportedRecords(clearRecords)
    }
    if (conflicts.length > 0) {
      pendingImportRecords.value = conflictRecords
      importConflictRows.value = conflicts
      importConflictVisible.value = true
      if (clearRecords.length > 0) {
        toast.add({
          severity: 'success',
          summary: '已导入无冲突记录',
          detail: `已导入 ${clearRecords.length} 条练习记录`,
          life: 2800
        })
      }
      toast.add({
        severity: 'warn',
        summary: '发现导入冲突',
        detail: `${conflicts.length} 条练习记录 ID 已存在`,
        life: 3500
      })
      return
    }
    toast.add({
      severity: 'success',
      summary: '导入完成',
      detail: `已导入 ${clearRecords.length} 条练习记录`,
      life: 3200
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: error instanceof Error ? error.message : '文件格式不正确',
      life: 4000
    })
  } finally {
    input.value = ''
    isImporting.value = false
  }
}

function deleteRecord(recordId: string) {
  const now = Date.now()
  upsertPracticeRecords([{ id: recordId, updatedAt: now, deletedAt: now } as PracticeRecord])
  syncLocalRecords(currentPage.value)
}

function confirmDeleteRecord(record: PracticeRecord) {
  const title = getRecordTitle(record)
  const answered = getRecordAnsweredCount(record)
  const total = getRecordTotalCount(record)
  confirm.require({
    header: '删除记录',
    message: [
      `你真的要删除 ${title} · ${getModeLabel(record.practiceMode)} 记录吗？`,
      `${formatTimestamp(record.updatedAt)} · 用时 ${formatDuration(record.progress?.timeSpentSeconds ?? 0)} · 进度 ${answered}/${total}（${getRecordProgressPercent(record)}%）`
    ].join('\n'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: '取消',
    acceptLabel: '删除',
    acceptClass: 'p-button-danger',
    defaultFocus: 'reject',
    accept: () => deleteRecord(record.id)
  })
}

function continueRecord(record: PracticeRecord) {
  router.push({ name: 'test', params: { id: record.testId }, query: { record: record.id } })
}

const recordCount = computed(() => totalRecords.value)

const cloudLimitText = computed(() => {
  if (!userStore.user) return ''
  const rawLimit = cloudLimitOverride.value
  const savedText = `已保存 ${cloudSavedCount.value === null ? '--' : cloudSavedCount.value} 条`
  if (rawLimit === null) return `云端数据获取中，${savedText}`
  if (!Number.isFinite(rawLimit) || rawLimit === -1) return `云端不限，${savedText}`
  return `云端最多保存 ${Math.floor(rawLimit)} 条，${savedText}`
})

function handlePage(event: PageState) {
  const page = event.page ?? 0
  syncLocalRecords(page + 1)
}

function isRecordSyncing(recordId: string) {
  return syncingRecordIds.value.has(recordId)
}

function getRecordCloudState(record: PracticeRecord) {
  return cloudStatus.value[record.id]
}

function isRecordCloudLatest(record: PracticeRecord) {
  const value = getRecordCloudState(record)
  return Boolean(value?.exists && typeof value.updatedAt === 'number' && value.updatedAt >= record.updatedAt)
}

function getCloudStatusLabel(record: PracticeRecord) {
  if (isRecordSyncing(record.id)) return '云端同步中'
  const value = getRecordCloudState(record)
  if (value?.exists && isRecordCloudLatest(record)) return '云端已存档'
  if (value?.exists) return '云端待更新'
  if (value?.exists === false) return '云端未存档'
  return '云端检查中'
}

function getCloudStatusSeverity(record: PracticeRecord) {
  if (isRecordSyncing(record.id)) return 'info'
  const value = getRecordCloudState(record)
  if (value?.exists && isRecordCloudLatest(record)) return 'success'
  if (value?.exists) return 'warn'
  if (value?.exists === false) return 'danger'
  return 'warn'
}

function getRecordSyncButtonLabel(record: PracticeRecord) {
  if (isRecordSyncing(record.id)) return '同步中'
  const value = getRecordCloudState(record)
  if (value?.exists && isRecordCloudLatest(record)) return '已同步'
  if (value?.exists) return '更新'
  if (value?.exists === false) return '推送'
  return '检查中'
}

function markCloudPending(ids: string[]) {
  if (!ids.length) return
  const next = { ...cloudStatus.value }
  ids.forEach((id) => {
    next[id] = null
  })
  cloudStatus.value = next
}

async function refreshCloudStatus(ids: string[], force = false) {
  if (!userStore.user) return
  const target = (force
    ? ids
    : ids.filter((id) => !(id in cloudStatus.value))
  ).slice(0, 200)
  const shouldFetchSummary =
    force ||
    target.length > 0 ||
    cloudSavedCount.value === null ||
    cloudLimitOverride.value === null
  if (!shouldFetchSummary) return
  if (target.length) {
    markCloudPending(target)
  }
  try {
    const response = await fetch(`${apiBase}/api/records/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids: target })
    })
    if (!response.ok) return
    const data = (await response.json()) as {
      ids?: string[]
      records?: Array<{ id?: unknown; updatedAt?: unknown }>
      savedCount?: number
      limit?: number
    }
    if (typeof data.savedCount === 'number' && Number.isFinite(data.savedCount)) {
      cloudSavedCount.value = Math.max(0, Math.floor(data.savedCount))
    }
    if (typeof data.limit === 'number' && Number.isFinite(data.limit)) {
      cloudLimitOverride.value = Math.floor(data.limit)
    }
    if (target.length > 0) {
      const exists = new Set(Array.isArray(data.ids) ? data.ids : [])
      const meta = new Map(
        Array.isArray(data.records)
          ? data.records
              .map((item) => {
                const id = typeof item.id === 'string' ? item.id : ''
                const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
                  ? item.updatedAt
                  : null
                return [id, updatedAt] as const
              })
              .filter(([id]) => Boolean(id))
          : []
      )
      const next = { ...cloudStatus.value }
      target.forEach((id) => {
        next[id] = {
          exists: exists.has(id),
          updatedAt: meta.get(id) ?? null
        }
      })
      cloudStatus.value = next
    }
  } catch {
    // ignore
  }
}

async function syncSingleRecord(record: PracticeRecord) {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  const storage = getVtixStorage()
  if (!storage || !record?.id) return
  if (syncingRecordIds.value.has(record.id)) return
  const next = new Set(syncingRecordIds.value)
  next.add(record.id)
  syncingRecordIds.value = next
  try {
    const syncStartedAt = Date.now()
    const syncScope = userStore.user?.id ?? ''
    const forceUpdatedAt = Date.now()
    const forcedRecord: PracticeRecord = {
      ...record,
      updatedAt: forceUpdatedAt
    }
    const previousCursor = getSyncCursor(storage, syncScope)
    const response = await fetch(`${apiBase}/api/records/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ since: previousCursor, records: [forcedRecord] })
    })
    if (!response.ok) {
      throw new Error(`同步失败: ${response.status}`)
    }
    const data = (await response.json()) as {
      records?: PracticeRecord[]
      cursor?: number
      savedCount?: number
      limit?: number
    }
    if (typeof data.savedCount === 'number' && Number.isFinite(data.savedCount)) {
      cloudSavedCount.value = Math.max(0, Math.floor(data.savedCount))
    }
    if (typeof data.limit === 'number' && Number.isFinite(data.limit)) {
      cloudLimitOverride.value = Math.floor(data.limit)
    }
    const remote = Array.isArray(data.records) ? data.records : []
    if (remote.length > 0) {
      upsertPracticeRecords(remote)
    } else {
      upsertPracticeRecords([forcedRecord])
    }
    const cursor =
      typeof data.cursor === 'number' && Number.isFinite(data.cursor)
        ? data.cursor
        : previousCursor
    setSyncCursor(storage, cursor, syncScope)
    setSyncAt(storage, syncStartedAt, syncScope)
    syncLocalRecords(currentPage.value)
    await refreshCloudStatus([record.id], true)
    toast.add({
      severity: 'success',
      summary: '同步完成',
      detail: '已推送该记录到云端',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '同步失败',
      life: 3500
    })
  } finally {
    const updated = new Set(syncingRecordIds.value)
    updated.delete(record.id)
    syncingRecordIds.value = updated
  }
}

onMounted(() => {
  syncLocalRecords()
})

watch(
  () => userStore.user?.id,
  () => {
    cloudStatus.value = {}
    cloudSavedCount.value = null
    cloudLimitOverride.value = null
    syncLocalRecords(currentPage.value, true)
  }
)
</script>

<template>
  <section class="records-page">
    <Dialog
      v-model:visible="importConflictVisible"
      modal
      :header="`${importConflictRows.length}条记录冲突`"
      class="record-import-dialog"
      :style="{ width: 'min(900px, calc(100vw - 32px))' }"
      :closable="!isImporting"
      @hide="closeImportConflictDialog()"
    >
      <div class="import-conflict-list">
        <div v-for="row in importConflictRows" :key="row.id" class="import-conflict-row">
          <div class="import-conflict-main">
            <div class="record-id">{{ row.id }}</div>
            <div class="record-pair">
              <div>
                <div class="record-label">现有记录</div>
                <div class="record-name">{{ row.existingTitle }} · {{ row.existingMode }}</div>
                <div class="record-sub">
                  {{ formatTimestamp(row.existingUpdatedAt) }} · 用时 {{ row.existingDuration }} · 进度 {{ row.existingProgress }}
                </div>
              </div>
              <div>
                <div class="record-label">导入记录</div>
                <div class="record-name">{{ row.title }} · {{ row.mode }}</div>
                <div class="record-sub">
                  {{ formatTimestamp(row.updatedAt) }} · 用时 {{ row.duration }} · 进度 {{ row.progress }}
                </div>
              </div>
            </div>
          </div>
          <div class="import-row-actions">
            <Button
              label="覆盖"
              size="small"
              severity="secondary"
              text
              :disabled="isImporting"
              @click="applyConflictRecord(row.id, 'overwrite')"
            />
            <Button
              label="保留两者"
              size="small"
              severity="secondary"
              text
              :disabled="isImporting"
              @click="applyConflictRecord(row.id, 'keep-both')"
            />
            <Button
              label="不保留"
              size="small"
              severity="secondary"
              text
              :disabled="isImporting"
              @click="applyConflictRecord(row.id, 'skip')"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="全部覆盖"
          severity="secondary"
          text
          :disabled="isImporting"
          @click="resolveAllImportConflicts('overwrite')"
        />
        <Button
          label="全部保留两者"
          severity="secondary"
          text
          :disabled="isImporting"
          @click="resolveAllImportConflicts('keep-both')"
        />
        <Button
          label="全部取消"
          severity="secondary"
          text
          :loading="isImporting"
          @click="resolveAllImportConflicts('skip')"
        />
      </template>
    </Dialog>
    <header class="page-head">
      <div>
        <div class="eyebrow">做题记录</div>
        <h1>练习记录</h1>
      </div>
      <div class="page-actions">
        <Button label="导出" severity="secondary" text size="small" :disabled="isImportBusy" @click="exportAllRecords" />
        <Button
          label="导入"
          severity="secondary"
          text
          size="small"
          :loading="isImporting"
          :disabled="isImportBusy"
          @click="triggerImport"
        />
        <Button
          v-if="userStore.user"
          label="同步"
          icon="pi pi-cloud"
          severity="secondary"
          text
          size="small"
          :loading="isSyncing"
          :disabled="isImportBusy"
          @click="handleSyncAuto"
        />
        <input ref="importInput" class="record-file" type="file" accept="application/json" @change="handleImport" />
      </div>
    </header>

    <Card class="records-card">
      <template #content>
        <div class="summary">
          共 {{ recordCount }} 条记录
          <span v-if="cloudLimitText"> · {{ cloudLimitText }}</span>
          <span v-if="isImporting"> · 正在导入...</span>
          <span v-else-if="importConflictVisible"> · 等待处理导入冲突</span>
        </div>

        <div v-if="recordCount === 0" class="empty">暂无记录</div>

        <div v-else class="record-list">
          <div v-for="record in records" :key="record.id" class="record-row">
            <div class="record-info">
              <div class="record-title-row">
                <div class="record-title">{{ getRecordTitle(record) }} · {{ getModeLabel(record.practiceMode) }}</div>
                <Tag
                  v-if="userStore.user"
                  class="record-cloud-tag"
                  :value="getCloudStatusLabel(record)"
                  :severity="getCloudStatusSeverity(record)"
                />
              </div>
              <div class="record-meta">
                {{ formatTimestamp(record.updatedAt) }} ·
                用时 {{ formatDuration(record.progress?.timeSpentSeconds ?? 0) }} ·
                进度 {{ getRecordAnsweredCount(record) }}/{{ getRecordTotalCount(record) }}
              </div>
              <div class="record-progress">
                <div class="record-progress-bar" aria-hidden="true">
                  <div
                    class="record-progress-fill"
                    :style="{ width: `${getRecordProgressPercent(record)}%` }"
                  />
                </div>
                <div class="record-progress-text">已完成 {{ getRecordProgressPercent(record) }}%</div>
              </div>
            </div>
            <div class="record-actions">
              <Button label="继续" size="small" :disabled="isImportBusy" @click="continueRecord(record)" />
              <Button
                v-if="userStore.user"
                :label="getRecordSyncButtonLabel(record)"
                size="small"
                severity="secondary"
                text
                icon="pi pi-cloud-upload"
                :loading="isRecordSyncing(record.id)"
                :disabled="isImportBusy"
                @click="syncSingleRecord(record)"
              />
              <Button label="导出" size="small" severity="secondary" text :disabled="isImportBusy" @click="exportSingleRecord(record)" />
              <Button label="删除" size="small" severity="danger" text :disabled="isImportBusy" @click="confirmDeleteRecord(record)" />
            </div>
          </div>
        </div>

        <Paginator
          v-if="recordCount > 0"
          class="record-paginator"
          :first="(currentPage - 1) * pageSize"
          :rows="pageSize"
          :totalRecords="recordCount"
          template="PrevPageLink PageLinks NextPageLink"
          @page="handlePage"
        />
      </template>
    </Card>
  </section>
</template>

<style scoped>
.records-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.record-file {
  display: none;
}

.page-head h1 {
  margin: 4px 0 6px;
  font-size: 28px;
  color: var(--vtix-text-strong);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.record-import-dialog :deep(.p-dialog-content) {
  padding-top: 0;
}

.import-conflict-list {
  display: flex;
  flex-direction: column;
  max-height: min(54vh, 520px);
  overflow: auto;
  border: 1px solid var(--vtix-border);
  border-radius: 12px;
}

.import-conflict-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 14px 16px;
}

.import-conflict-row + .import-conflict-row {
  border-top: 1px solid var(--vtix-border);
}

.import-conflict-main {
  min-width: 0;
}

.record-id {
  color: var(--vtix-text-muted);
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
}

.record-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 8px;
}

.record-label {
  color: var(--vtix-text-subtle);
  font-size: 12px;
}

.record-name {
  margin-top: 3px;
  color: var(--vtix-text-strong);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-sub {
  margin-top: 3px;
  color: var(--vtix-text-muted);
  font-size: 12px;
}

.import-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.records-card {
  overflow: hidden;
}

.records-card :deep(.p-card-body) {
  gap: 0;
  padding: 0;
}

.records-card :deep(.p-card-content) {
  padding: 0;
}

.summary {
  color: var(--vtix-text-muted);
  font-size: 13px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--vtix-border);
}

.record-list {
  display: flex;
  flex-direction: column;
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.record-row + .record-row {
  border-top: 1px solid var(--vtix-border);
}

.record-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.record-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.record-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.record-cloud-tag :deep(.p-tag) {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
}

.record-meta {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.record-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-self: center;
  min-width: 230px;
}

.record-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.record-progress-bar {
  width: 220px;
  max-width: 45vw;
  height: 4px;
  border-radius: 999px;
  background: var(--vtix-surface-3);
  border: 1px solid var(--vtix-border);
  overflow: hidden;
}

.record-progress-fill {
  height: 100%;
  width: 0;
  background: var(--vtix-primary-500);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.record-progress-text {
  font-size: 11px;
  color: var(--vtix-text-muted);
  min-width: 70px;
  text-align: right;
}

.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
  padding: 32px 18px;
}

.record-paginator {
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.record-paginator :deep(.p-paginator-page),
.record-paginator :deep(.p-paginator-next),
.record-paginator :deep(.p-paginator-prev) {
  min-width: 2rem;
  height: 2rem;
}

.record-paginator :deep(.p-select) {
  height: 2rem;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .record-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .record-title-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .record-actions {
    width: 100%;
    justify-content: flex-start;
    min-width: 0;
  }

  .import-conflict-row {
    grid-template-columns: 1fr;
  }

  .import-row-actions {
    justify-content: flex-start;
  }

  .record-pair {
    grid-template-columns: 1fr;
  }

  .record-progress-bar {
    width: 100%;
    max-width: none;
  }
}
</style>
