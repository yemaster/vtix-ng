<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Paginator from 'primevue/paginator'
import Tag from 'primevue/tag'
import type { PageState } from 'primevue/paginator'
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

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const records = ref<PracticeRecord[]>([])
const importInput = ref<HTMLInputElement | null>(null)
const userStore = useUserStore()
const isSyncing = ref(false)
const toast = useToast()
const pageSize = ref(8)
const currentPage = ref(1)
const totalRecords = ref(0)
const cloudStatus = ref<Record<string, boolean | null>>({})
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

function getModeLabel(value: number) {
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
  const total = record.progress?.problemList?.length ?? 0
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
  importInput.value?.click()
}

function toRecord(raw: any): PracticeRecord | null {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.progress || !Array.isArray(raw.progress.problemList)) return null
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    testId: typeof raw.testId === 'string' ? raw.testId : '',
    testTitle: typeof raw.testTitle === 'string' ? raw.testTitle : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    practiceMode: typeof raw.practiceMode === 'number' ? raw.practiceMode : 0,
    progress: raw.progress
  }
}

function mergeRecords(incoming: PracticeRecord[]) {
  if (!incoming.length) return []
  upsertPracticeRecords(incoming)
  syncLocalRecords(1)
  return incoming
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
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
    if (!Array.isArray(rawRecords)) return
    const incoming = rawRecords
      .map(toRecord)
      .filter((record): record is PracticeRecord => Boolean(record?.id && record?.testId))
    if (!incoming.length) return
    mergeRecords(incoming)
  } catch (error) {
    // ignore invalid files
  } finally {
    input.value = ''
  }
}

function deleteRecord(recordId: string) {
  const now = Date.now()
  upsertPracticeRecords([{ id: recordId, updatedAt: now, deletedAt: now } as PracticeRecord])
  syncLocalRecords(currentPage.value)
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

function getCloudStatusLabel(recordId: string) {
  if (isRecordSyncing(recordId)) return '云端同步中'
  const value = cloudStatus.value[recordId]
  if (value === true) return '云端已存档'
  if (value === false) return '云端未存档'
  return '云端检查中'
}

function getCloudStatusSeverity(recordId: string) {
  if (isRecordSyncing(recordId)) return 'info'
  const value = cloudStatus.value[recordId]
  if (value === true) return 'success'
  if (value === false) return 'danger'
  return 'warn'
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
      const next = { ...cloudStatus.value }
      target.forEach((id) => {
        next[id] = exists.has(id)
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
    <header class="page-head">
      <div>
        <div class="eyebrow">做题记录</div>
        <h1>练习记录</h1>
      </div>
      <div class="page-actions">
        <Button label="导出" severity="secondary" text size="small" @click="exportAllRecords" />
        <Button label="导入" severity="secondary" text size="small" @click="triggerImport" />
        <Button
          v-if="userStore.user"
          label="同步"
          icon="pi pi-cloud"
          severity="secondary"
          text
          size="small"
          :loading="isSyncing"
          @click="handleSyncAuto"
        />
        <input ref="importInput" class="record-file" type="file" accept="application/json" @change="handleImport" />
      </div>
    </header>

    <div class="summary">
      共 {{ recordCount }} 条记录
      <span v-if="cloudLimitText"> · {{ cloudLimitText }}</span>
    </div>

    <div v-if="recordCount === 0" class="empty">暂无记录</div>

    <div v-else class="record-list">
      <div v-for="record in records" :key="record.id" class="record-card">
        <div class="record-info">
          <div class="record-title-row">
            <div class="record-title">{{ record.testTitle ?? `题库 ${record.testId}` }} · {{ getModeLabel(record.practiceMode) }}</div>
            <Tag
              v-if="userStore.user"
              class="record-cloud-tag"
              :value="getCloudStatusLabel(record.id)"
              :severity="getCloudStatusSeverity(record.id)"
            />
          </div>
          <div class="record-meta">
            {{ formatTimestamp(record.updatedAt) }} ·
            用时 {{ formatDuration(record.progress?.timeSpentSeconds ?? 0) }} ·
            进度 {{ getRecordAnsweredCount(record) }}/{{ record.progress?.problemList?.length ?? 0 }}
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
          <Button label="继续" size="small" @click="continueRecord(record)" />
          <Button
            v-if="userStore.user"
            label="同步"
            size="small"
            severity="secondary"
            text
            icon="pi pi-cloud-upload"
            :loading="isRecordSyncing(record.id)"
            @click="syncSingleRecord(record)"
          />
          <Button label="导出" size="small" severity="secondary" text @click="exportSingleRecord(record)" />
          <Button label="删除" size="small" severity="danger" text @click="deleteRecord(record.id)" />
        </div>
      </div>
    </div>
    <div v-if="recordCount > pageSize" class="pagination">
      <Paginator
        :first="(currentPage - 1) * pageSize"
        :rows="pageSize"
        :totalRecords="recordCount"
        template="PrevPageLink PageLinks NextPageLink"
        @page="handlePage"
      />
    </div>
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
  margin: 8px 0 6px;
  font-size: 28px;
  color: var(--vtix-text-strong);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.summary {
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 12px 24px var(--vtix-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
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

.pagination :deep(.p-paginator-pages .p-paginator-page) {
  font-size: 14px;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .record-card {
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

  .record-progress-bar {
    width: 100%;
    max-width: none;
  }
}
</style>
