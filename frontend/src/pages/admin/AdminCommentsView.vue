<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useUserStore } from '../../stores/user'

const MANAGE_COMMENTS_PERMISSION = 1 << 13
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const toast = useToast()
const confirm = useConfirm()
const userStore = useUserStore()

type ReportedReport = {
  reportId: number
  reason: string | null
  createdAt: number
}

type ReportedCommentGroup = {
  commentId: number
  problemId: number
  setTitle: string | null
  questionNumber: number | null
  commentUserName: string
  commentContent: string
  floor: number
  likeCount: number
  openCount: number
  totalCount: number
  latestReportAt: number
  reports: ReportedReport[]
}

const items = ref<ReportedCommentGroup[]>([])
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const pageSizeOptions = [10, 20, 30]
const deletingId = ref<number | null>(null)
const dismissingId = ref<number | null>(null)

const canManage = computed(
  () =>
    !!userStore.user &&
    (userStore.user.permissions & MANAGE_COMMENTS_PERMISSION) ===
      MANAGE_COMMENTS_PERMISSION
)

function formatRelativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--'
  const diff = Date.now() - timestamp
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
}

function problemLabel(item: ReportedCommentGroup) {
  const title = item.setTitle?.trim()
  if (title && item.questionNumber) return `《${title}》第${item.questionNumber}题`
  if (title) return `《${title}》`
  return `题目 #${item.problemId}`
}

async function loadItems() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(
      `${apiBase}/api/admin/comments/reported?page=${page.value}&pageSize=${pageSize.value}`,
      { credentials: 'include' }
    )
    if (!response.ok) throw new Error(`加载失败: ${response.status}`)
    const data = (await response.json()) as ReportedCommentGroup[]
    items.value = Array.isArray(data) ? data : []
    const totalHeader = response.headers.get('x-total-count')
    const totalNum = totalHeader ? Number(totalHeader) : NaN
    total.value = Number.isFinite(totalNum)
      ? Math.max(0, totalNum)
      : (page.value - 1) * pageSize.value + items.value.length
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') pageSize.value = event.rows
  page.value = (event.page ?? 0) + 1
  void loadItems()
}

function handleDelete(item: ReportedCommentGroup) {
  confirm.require({
    header: '删除评论',
    message: '确定删除这条评论吗？将同时移除它的全部点赞与举报记录。',
    acceptLabel: '删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary' },
    defaultFocus: 'reject',
    accept: () => doDelete(item)
  })
}

async function doDelete(item: ReportedCommentGroup) {
  deletingId.value = item.commentId
  try {
    const response = await fetch(`${apiBase}/api/comments/${item.commentId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null
    if (!response.ok) {
      toast.add({
        severity: 'error',
        summary: '删除失败',
        detail: data?.error || `删除失败: ${response.status}`,
        life: 3000
      })
      return
    }
    toast.add({ severity: 'success', summary: '已删除', life: 2000 })
    if (items.value.length <= 1 && page.value > 1) page.value -= 1
    await loadItems()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  } finally {
    deletingId.value = null
  }
}

function handleDismiss(item: ReportedCommentGroup) {
  confirm.require({
    header: '忽略举报',
    message: `确定忽略这 ${item.openCount} 条举报吗？仅移除待处理举报，评论予以保留。`,
    acceptLabel: '忽略',
    rejectLabel: '取消',
    rejectProps: { severity: 'secondary' },
    defaultFocus: 'reject',
    accept: () => doDismiss(item)
  })
}

async function doDismiss(item: ReportedCommentGroup) {
  dismissingId.value = item.commentId
  try {
    const response = await fetch(
      `${apiBase}/api/admin/comments/${item.commentId}/dismiss-reports`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null
    if (!response.ok) {
      toast.add({
        severity: 'error',
        summary: '操作失败',
        detail: data?.error || `操作失败: ${response.status}`,
        life: 3000
      })
      return
    }
    toast.add({ severity: 'success', summary: '已忽略', life: 2000 })
    if (items.value.length <= 1 && page.value > 1) page.value -= 1
    await loadItems()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '操作失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  } finally {
    dismissingId.value = null
  }
}

onMounted(() => {
  if (canManage.value) void loadItems()
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">评论管理</div>
        <h1>举报处理</h1>
        <p>
          按被举报的评论聚合展示。「忽略」会清掉该评论的全部待处理举报（评论保留）；「删除评论」会移除评论及其全部点赞与举报记录。
        </p>
      </div>
    </header>

    <div v-if="!canManage" class="status">
      <div class="status-title">无权限</div>
      <div class="status-detail">你没有管理评论的权限。</div>
    </div>

    <div v-else-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <Card v-else class="report-card">
      <template #content>
        <div v-if="loading" class="state-text">加载中…</div>
        <div v-else-if="!items.length" class="state-text">暂无待处理举报</div>
        <ul v-else class="report-list">
          <li v-for="item in items" :key="item.commentId" class="report-item">
            <div class="report-main">
              <div class="report-meta">
                <Tag severity="secondary">{{ item.floor }}楼</Tag>
                <span class="report-author">{{ item.commentUserName || '匿名' }}</span>
                <span class="report-dot">·</span>
                <span class="report-sub">{{ problemLabel(item) }}</span>
                <span class="report-dot">·</span>
                <time class="report-sub">{{ formatRelativeTime(item.latestReportAt) }}</time>
              </div>
              <p class="report-content">{{ item.commentContent }}</p>
              <div class="report-summary">
                <span class="summary-count">
                  待处理举报 <strong>{{ item.openCount }}</strong> 条
                </span>
                <span class="summary-sep">·</span>
                <span class="summary-total">累计共被举报 {{ item.totalCount }} 次</span>
              </div>
              <div v-if="item.reports.length" class="report-reasons">
                <Tag
                  v-for="r in item.reports"
                  :key="r.reportId"
                  severity="warn"
                  class="reason-tag"
                >
                  {{ r.reason || '未填写' }}
                </Tag>
              </div>
            </div>
            <div class="report-actions">
              <Button
                :label="`忽略这 ${item.openCount} 条`"
                severity="secondary"
                size="small"
                :loading="dismissingId === item.commentId"
                @click="handleDismiss(item)"
              />
              <Button
                label="删除评论"
                severity="danger"
                size="small"
                :loading="deletingId === item.commentId"
                @click="handleDelete(item)"
              />
            </div>
          </li>
        </ul>

        <Paginator
          v-if="total > 0"
          class="report-paginator"
          :first="(page - 1) * pageSize"
          :rows="pageSize"
          :total-records="total"
          :rows-per-page-options="pageSizeOptions"
          template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
          @page="handlePage"
        />
      </template>
    </Card>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-head h1 {
  margin: 4px 0 6px;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.page-head p {
  margin: 0;
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.status {
  border: 1px solid var(--vtix-danger-border);
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  padding: 14px 16px;
  border-radius: 14px;
}

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.state-text {
  text-align: center;
  color: var(--vtix-text-subtle);
  font-size: 13px;
  padding: 18px;
}

.report-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.report-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
}

.report-item + .report-item {
  border-top: 1px solid var(--vtix-border);
}

.report-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.report-author {
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 13px;
}

.report-sub {
  color: var(--vtix-text-muted);
}

.report-dot {
  color: var(--vtix-text-subtle);
}

.report-content {
  margin: 0;
  color: var(--vtix-text);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.report-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.report-summary strong {
  color: var(--vtix-danger-text);
}

.summary-sep {
  color: var(--vtix-text-subtle);
}

.summary-total {
  color: var(--vtix-text-subtle);
}

.report-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.reason-tag {
  font-size: 11px;
}

.report-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.report-paginator {
  border-top: 1px solid var(--vtix-border);
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
}
</style>
