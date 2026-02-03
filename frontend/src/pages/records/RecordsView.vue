<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import {
  getSyncAt,
  getSyncCursor,
  setSyncAt,
  setSyncCursor,
  syncRecords
} from '../../base/recordSync'

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
const STORAGE_KEY = 'vtixSave'
const router = useRouter()
const records = ref<PracticeRecord[]>([])
const importInput = ref<HTMLInputElement | null>(null)
const userStore = useUserStore()
const isSyncing = ref(false)
const toast = useToast()

const modes = [
  { label: '顺序练习', value: 0 },
  { label: '乱序练习', value: 1 },
  { label: '自定义练习', value: 2 },
  { label: '错题回顾', value: 4 },
  { label: '模拟考试', value: 5 }
]

type RecordReadOptions = { includeDeleted?: boolean }

function isDeletedRecord(record: PracticeRecord) {
  return typeof (record as { deletedAt?: unknown }).deletedAt === 'number' &&
    Number((record as { deletedAt?: number }).deletedAt ?? 0) > 0
}

function readRecords(options: RecordReadOptions = {}): PracticeRecord[] {
  if (!window.localStorage) return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const list = parsed.filter((item) => item && typeof item.id === 'string')
    return options.includeDeleted ? list : list.filter((item) => !isDeletedRecord(item))
  } catch (error) {
    return []
  }
}

function writeRecords(next: PracticeRecord[]) {
  if (!window.localStorage) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

function syncLocalRecords() {
  records.value = readRecords().sort((a, b) => b.updatedAt - a.updatedAt)
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
    records: readRecords()
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
    router.push({ name: 'login' })
    return
    }
    isSyncing.value = true
    try {
      const localRecords = readRecords({ includeDeleted: true })
      const previousCursor = getSyncCursor(localStorage)
      const since = localRecords.length ? previousCursor : 0
      const localSince = getSyncAt(localStorage)
      const result = await syncRecords<PracticeRecord>({
        apiBase,
        localRecords,
        since,
        localSince,
        credentials: 'include'
      })

      if (result.localChanged) {
        writeRecords(result.finalRecords)
      }
      records.value = result.finalRecords
        .filter((item) => !isDeletedRecord(item))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      setSyncCursor(localStorage, result.cursor)
      setSyncAt(localStorage, Date.now())

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
  const existing = readRecords({ includeDeleted: true })
  const recordMap = new Map(existing.map((item) => [item.id, item]))
  for (const record of incoming) {
    recordMap.set(record.id, record)
  }
  let merged = Array.from(recordMap.values())
  merged = merged
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(Math.max(0, merged.length - 10))
  writeRecords(merged)
  records.value = merged
    .filter((item) => !isDeletedRecord(item))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return merged
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
  const next = readRecords({ includeDeleted: true }).filter((item) => item.id !== recordId)
  next.push({ id: recordId, updatedAt: now, deletedAt: now } as PracticeRecord)
  writeRecords(next)
  records.value = readRecords().sort((a, b) => b.updatedAt - a.updatedAt)
}

function continueRecord(record: PracticeRecord) {
  router.push({ name: 'test', params: { id: record.testId }, query: { record: record.id } })
}

const recordCount = computed(() => records.value.length)

onMounted(() => {
  syncLocalRecords()
})
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

    <div class="summary">共 {{ recordCount }} 条记录（最多保留 10 条）</div>

    <div v-if="recordCount === 0" class="empty">暂无记录</div>

    <div v-else class="record-list">
      <div v-for="record in records" :key="record.id" class="record-card">
        <div class="record-info">
          <div class="record-title">{{ record.testTitle ?? `题库 ${record.testId}` }} · {{ getModeLabel(record.practiceMode) }}</div>
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
          <Button label="导出" size="small" severity="secondary" text @click="exportSingleRecord(record)" />
          <Button label="删除" size="small" severity="danger" text @click="deleteRecord(record.id)" />
        </div>
      </div>
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
  color: #0f172a;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
}

.summary {
  color: #64748b;
  font-size: 13px;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.record-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  background: #f1f5f9;
  border: 1px solid #e5e7eb;
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
  color: #64748b;
  min-width: 70px;
  text-align: right;
}

.empty {
  color: #9aa2b2;
  text-align: center;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .record-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .record-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .record-progress-bar {
    width: 100%;
    max-width: none;
  }
}
</style>
