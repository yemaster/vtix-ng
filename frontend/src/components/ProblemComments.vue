<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useUserStore } from '../stores/user'
import { pushLoginRequired } from '../utils/auth'

const props = defineProps<{ problemId?: number }>()

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const MAX_COMMENT_LENGTH = 500
const MANAGE_COMMENTS_PERMISSION = 1 << 13

type CommentReplyTo = {
  commentId: number
  floor: number
  userName: string
  snippet: string
  deleted: boolean
}

type CommentItem = {
  id: number
  problemId: number
  userId: string
  userName: string
  content: string
  floor: number
  likeCount: number
  liked: boolean
  replyTo: CommentReplyTo | null
  createdAt: number
  updatedAt: number
}

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const userStore = useUserStore()

const comments = ref<CommentItem[]>([])
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const pageSizeOptions = [10, 20, 30]
type SortMode = 'latest' | 'hot'
const sort = ref<SortMode>('latest')
const sortOptions = [
  { label: '最新', value: 'latest' as SortMode },
  { label: '最热', value: 'hot' as SortMode }
]

const composerText = ref('')
const submitting = ref(false)
const likePending = ref<Set<number>>(new Set())
const composerRef = ref<any>(null)
// When set, the composer shows a "引用 N楼 @作者" banner and the submit will
// attach replyToCommentId so the quoted author gets notified.
const replyTarget = ref<{
  id: number
  floor: number
  userName: string
  snippet: string
} | null>(null)

const composerPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 ${replyTarget.value.floor}楼 @${replyTarget.value.userName}…`
    : '说说你对这道题的看法、巧妙记法或吐槽…'
)

const reportVisible = ref(false)
const reportTargetId = ref<number | null>(null)
const reportReason = ref('')
const reporting = ref(false)

const isLoggedIn = computed(() => !!userStore.user)
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

function makeSnippet(text: string, max = 40) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function startReply(comment: CommentItem) {
  if (!isLoggedIn.value) {
    void pushLoginRequired(router)
    return
  }
  replyTarget.value = {
    id: comment.id,
    floor: comment.floor,
    userName: comment.userName || '匿名',
    snippet: makeSnippet(comment.content)
  }
  void nextTick(() => {
    const el = (composerRef.value?.$el ?? composerRef.value) as
      | HTMLTextAreaElement
      | undefined
    el?.focus?.()
  })
}

function clearReply() {
  replyTarget.value = null
}

async function loadComments() {
  if (!props.problemId) {
    comments.value = []
    total.value = 0
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(
      `${apiBase}/api/problems/${props.problemId}/comments?page=${page.value}&pageSize=${pageSize.value}&sort=${sort.value}`,
      { credentials: 'include' }
    )
    if (!response.ok) throw new Error(`加载失败: ${response.status}`)
    const data = (await response.json()) as CommentItem[]
    comments.value = Array.isArray(data) ? data : []
    const totalHeader = response.headers.get('x-total-count')
    const totalNum = totalHeader ? Number(totalHeader) : NaN
    total.value = Number.isFinite(totalNum)
      ? Math.max(0, totalNum)
      : (page.value - 1) * pageSize.value + comments.value.length
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    comments.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function reloadFromFirstPage() {
  page.value = 1
  return loadComments()
}

async function submitComment() {
  if (!isLoggedIn.value) {
    void pushLoginRequired(router)
    return
  }
  if (!props.problemId) return
  const content = composerText.value.trim()
  if (!content) {
    toast.add({ severity: 'warn', summary: '内容为空', detail: '请输入评论内容', life: 3000 })
    return
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    toast.add({
      severity: 'warn',
      summary: '超出字数',
      detail: `评论不能超过 ${MAX_COMMENT_LENGTH} 个字`,
      life: 3000
    })
    return
  }
  submitting.value = true
  try {
    const response = await fetch(`${apiBase}/api/problems/${props.problemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        content,
        ...(replyTarget.value ? { replyToCommentId: replyTarget.value.id } : {})
      })
    })
    const data = (await response.json().catch(() => null)) as CommentItem | { error?: string } | null
    if (!response.ok) {
      const message = (data && 'error' in data && data.error) || `发表失败: ${response.status}`
      toast.add({ severity: 'error', summary: '发表失败', detail: message, life: 3000 })
      return
    }
    composerText.value = ''
    replyTarget.value = null
    toast.add({ severity: 'success', summary: '已发表', life: 2000 })
    await reloadFromFirstPage()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '发表失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  } finally {
    submitting.value = false
  }
}

async function toggleLike(comment: CommentItem) {
  if (!isLoggedIn.value) {
    void pushLoginRequired(router)
    return
  }
  if (likePending.value.has(comment.id)) return
  likePending.value.add(comment.id)
  const previousLiked = comment.liked
  const previousCount = comment.likeCount
  // optimistic
  comment.liked = !comment.liked
  comment.likeCount = Math.max(0, comment.likeCount + (comment.liked ? 1 : -1))
  try {
    const response = await fetch(`${apiBase}/api/comments/${comment.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    })
    const data = (await response.json().catch(() => null)) as
      | { liked?: boolean; likeCount?: number; error?: string }
      | null
    if (!response.ok) {
      comment.liked = previousLiked
      comment.likeCount = previousCount
      const message = data?.error || `操作失败: ${response.status}`
      toast.add({ severity: 'error', summary: '操作失败', detail: message, life: 3000 })
      return
    }
    comment.liked = Boolean(data?.liked)
    comment.likeCount = Number(data?.likeCount ?? comment.likeCount)
  } catch (error) {
    comment.liked = previousLiked
    comment.likeCount = previousCount
    toast.add({
      severity: 'error',
      summary: '操作失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  } finally {
    likePending.value.delete(comment.id)
  }
}

function openReport(comment: CommentItem) {
  if (!isLoggedIn.value) {
    void pushLoginRequired(router)
    return
  }
  reportTargetId.value = comment.id
  reportReason.value = ''
  reportVisible.value = true
}

async function confirmReport() {
  if (reportTargetId.value === null) return
  reporting.value = true
  try {
    const response = await fetch(`${apiBase}/api/comments/${reportTargetId.value}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason: reportReason.value.trim() })
    })
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; alreadyReported?: boolean; error?: string }
      | null
    if (!response.ok) {
      const message = data?.error || `举报失败: ${response.status}`
      toast.add({ severity: 'error', summary: '举报失败', detail: message, life: 3000 })
      return
    }
    toast.add({
      severity: 'success',
      summary: data?.alreadyReported ? '已提交过' : '举报已提交',
      detail: data?.alreadyReported ? '你已举报过这条评论' : '感谢你的反馈，管理员会尽快处理',
      life: 3000
    })
    reportVisible.value = false
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '举报失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  } finally {
    reporting.value = false
  }
}

function handleDelete(comment: CommentItem) {
  if (!isLoggedIn.value) {
    void pushLoginRequired(router)
    return
  }
  confirm.require({
    header: '删除评论',
    message: '确定删除这条评论吗？',
    acceptLabel: '删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary' },
    defaultFocus: 'reject',
    accept: () => doDelete(comment)
  })
}

async function doDelete(comment: CommentItem) {
  try {
    const response = await fetch(`${apiBase}/api/comments/${comment.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!response.ok) {
      const message = data?.error || `删除失败: ${response.status}`
      toast.add({ severity: 'error', summary: '删除失败', detail: message, life: 3000 })
      return
    }
    toast.add({ severity: 'success', summary: '已删除', life: 2000 })
    if (comments.value.length <= 1 && page.value > 1) {
      page.value -= 1
    }
    await loadComments()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: error instanceof Error ? error.message : '网络错误',
      life: 3000
    })
  }
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
  page.value = (event.page ?? 0) + 1
  void loadComments()
}

watch(
  () => props.problemId,
  () => {
    page.value = 1
    replyTarget.value = null
    void loadComments()
  },
  { immediate: true }
)

watch(sort, () => {
  page.value = 1
  void loadComments()
})
</script>

<template>
  <section class="problem-comments">
    <header class="comments-head">
      <div class="comments-title">
        <span>讨论</span>
        <Tag v-if="total > 0" :value="total" severity="secondary" rounded />
      </div>
      <SelectButton
        v-model="sort"
        :options="sortOptions"
        option-value="value"
        option-label="label"
        size="small"
        :allow-empty="false"
      />
    </header>

    <div v-if="isLoggedIn" class="composer">
      <div v-if="replyTarget" class="reply-banner">
        <span class="reply-icon pi pi-reply" aria-hidden="true" />
        <span class="reply-text">
          引用 {{ replyTarget.floor }}楼 @{{ replyTarget.userName }}：{{ replyTarget.snippet }}
        </span>
        <Button
          icon="pi pi-times"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="取消引用"
          @click="clearReply"
        />
      </div>
      <Textarea
        ref="composerRef"
        v-model="composerText"
        :auto-resize="true"
        rows="2"
        :maxlength="MAX_COMMENT_LENGTH"
        :placeholder="composerPlaceholder"
        class="composer-input"
      />
      <div class="composer-foot">
        <span class="char-count">{{ composerText.length }} / {{ MAX_COMMENT_LENGTH }}</span>
        <Button
          label="发表"
          size="small"
          :loading="submitting"
          :disabled="!composerText.trim()"
          @click="submitComment"
        />
      </div>
    </div>
    <div v-else class="login-hint">
      <Button
        label="登录后发表评论"
        size="small"
        severity="secondary"
        text
        @click="pushLoginRequired(router)"
      />
    </div>

    <div v-if="loadError" class="state-text error">{{ loadError }}</div>
    <div v-else-if="loading" class="state-text">加载中…</div>
    <div v-else-if="!comments.length" class="state-text">还没有评论，来抢沙发吧</div>

    <ul v-else class="comment-list">
      <li v-for="comment in comments" :key="comment.id" class="comment-item">
        <div class="comment-main">
          <div class="comment-meta">
            <Tag class="floor-tag" severity="secondary">{{ comment.floor }}楼</Tag>
            <span class="comment-author">{{ comment.userName || '匿名' }}</span>
            <time v-tooltip.bottom="formatRelativeTime(comment.createdAt)" class="comment-time">
              {{ formatRelativeTime(comment.createdAt) }}
            </time>
          </div>
          <div
            v-if="comment.replyTo"
            :class="['quote-chip', { deleted: comment.replyTo.deleted }]"
          >
            <span class="quote-icon pi pi-quote" aria-hidden="true" />
            <span>
              引用 {{ comment.replyTo.floor }}楼 @{{ comment.replyTo.userName }}：{{
                comment.replyTo.snippet
              }}
            </span>
          </div>
          <p class="comment-content">{{ comment.content }}</p>
        </div>
        <div class="comment-actions">
          <Button
            :label="String(comment.likeCount)"
            size="small"
            severity="secondary"
            :text="!comment.liked"
            :class="['like-btn', { liked: comment.liked }]"
            :icon="comment.liked ? 'pi pi-thumbs-up-fill' : 'pi pi-thumbs-up'"
            :loading="likePending.has(comment.id)"
            @click="toggleLike(comment)"
          />
          <Button
            v-if="isLoggedIn"
            label="引用"
            size="small"
            severity="secondary"
            text
            icon="pi pi-reply"
            @click="startReply(comment)"
          />
          <Button
            v-if="isLoggedIn && comment.userId !== userStore.user?.id"
            label="举报"
            size="small"
            severity="secondary"
            text
            @click="openReport(comment)"
          />
          <Button
            v-if="
              isLoggedIn &&
              (comment.userId === userStore.user?.id || canManage)
            "
            label="删除"
            size="small"
            severity="danger"
            text
            @click="handleDelete(comment)"
          />
        </div>
      </li>
    </ul>

    <Paginator
      v-if="total > 0"
      class="comments-paginator"
      :first="(page - 1) * pageSize"
      :rows="pageSize"
      :total-records="total"
      :rows-per-page-options="pageSizeOptions"
      template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
      @page="handlePage"
    />

    <Dialog
      v-model:visible="reportVisible"
      header="举报评论"
      :modal="true"
      :style="{ width: '420px' }"
      :breakpoints="{ '500px': '90vw' }"
    >
      <div class="report-body">
        <p class="report-tip">请简要说明举报理由（可选）：</p>
        <Textarea
          v-model="reportReason"
          :auto-resize="true"
          rows="3"
          :maxlength="200"
          placeholder="例如：含不当言论、广告、与题目无关…"
          class="report-input"
        />
      </div>
      <template #footer>
        <Button label="取消" severity="secondary" text @click="reportVisible = false" />
        <Button label="提交举报" :loading="reporting" @click="confirmReport" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.problem-comments {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--vtix-border);
}

.comments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comments-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 15px;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border);
  border-radius: 12px;
  padding: 10px;
}

.composer-input {
  width: 100%;
}

.reply-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border-strong);
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.reply-icon {
  color: var(--vtix-primary-600);
  flex-shrink: 0;
}

.reply-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.char-count {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.login-hint {
  display: flex;
  justify-content: center;
}

.state-text {
  text-align: center;
  color: var(--vtix-text-subtle);
  font-size: 13px;
  padding: 16px 0;
}

.state-text.error {
  color: var(--vtix-danger-text);
}

.comment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
}

.comment-item + .comment-item {
  border-top: 1px solid var(--vtix-border);
}

.comment-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.comment-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.floor-tag {
  font-size: 11px;
}

.comment-author {
  font-weight: 700;
  font-size: 13px;
  color: var(--vtix-text-strong);
}

.comment-time {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.comment-content {
  margin: 0;
  color: var(--vtix-text);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.quote-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border);
  font-size: 12px;
  color: var(--vtix-text-muted);
  line-height: 1.5;
}

.quote-icon {
  color: var(--vtix-text-subtle);
  flex-shrink: 0;
}

.quote-chip.deleted {
  font-style: italic;
  color: var(--vtix-text-subtle);
}

.quote-chip.deleted .quote-icon {
  opacity: 0.6;
}

.comment-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.like-btn.liked {
  color: var(--vtix-primary-600);
}

.report-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-tip {
  margin: 0;
  font-size: 13px;
  color: var(--vtix-text-muted);
}

.report-input {
  width: 100%;
}

.comments-paginator {
  border-radius: 0;
  padding: 4px 0;
  font-size: 12px;
}

@media (max-width: 900px) {
  .comments-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
