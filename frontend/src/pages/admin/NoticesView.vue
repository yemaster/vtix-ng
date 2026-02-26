<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

type Notice = {
  id: string
  title: string
  content: string
  authorName: string
  isPinned: boolean
  createdAt: number
  updatedAt: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const toast = useToast()

const notices = ref<Notice[]>([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const pinningId = ref('')

const form = ref({
  id: '',
  title: '',
  content: ''
})

const isEditing = computed(() => Boolean(form.value.id))

function resetForm() {
  form.value = {
    id: '',
    title: '',
    content: ''
  }
}

function startEdit(notice: Notice) {
  form.value = {
    id: notice.id,
    title: notice.title,
    content: notice.content
  }
}

function formatFullTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatRelativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }
  const diff = Date.now() - timestamp
  if (diff < 60 * 1000) {
    return '刚刚'
  }
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))} 分钟前`
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  return `${days} 天前`
}

function trimContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
}

async function loadNotices() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/notices`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as Notice[]
    notices.value = Array.isArray(data)
      ? data.map((item) => ({
          id: String(item.id),
          title: item.title ?? '',
          content: item.content ?? '',
          authorName: item.authorName ?? '管理员',
          isPinned: Boolean(item.isPinned),
          createdAt: Number(item.createdAt ?? 0),
          updatedAt: Number(item.updatedAt ?? item.createdAt ?? 0)
        }))
      : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    notices.value = []
  } finally {
    loading.value = false
  }
}

async function saveNotice() {
  saving.value = true
  try {
    const title = form.value.title.trim()
    const content = form.value.content.trim()
    if (!title || !content) {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请输入标题与内容',
        life: 3000
      })
      return
    }
    const url = isEditing.value
      ? `${apiBase}/api/admin/notices/${form.value.id}`
      : `${apiBase}/api/admin/notices`
    const method = isEditing.value ? 'PUT' : 'POST'
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, content })
    })
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`)
    }
    await loadNotices()
    resetForm()
    toast.add({
      severity: 'success',
      summary: isEditing.value ? '保存成功' : '创建成功',
      detail: isEditing.value ? '公告已更新' : '公告已创建',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存失败',
      life: 3500
    })
  } finally {
    saving.value = false
  }
}

async function deleteNotice(notice: Notice) {
  if (!window.confirm(`确定删除公告「${notice.title}」吗？`)) {
    return
  }
  try {
    const response = await fetch(`${apiBase}/api/admin/notices/${notice.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`删除失败: ${response.status}`)
    }
    await loadNotices()
    if (form.value.id === notice.id) {
      resetForm()
    }
    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: '公告已删除',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: error instanceof Error ? error.message : '删除失败',
      life: 3500
    })
  }
}

async function togglePinned(notice: Notice) {
  if (pinningId.value) return
  pinningId.value = notice.id
  try {
    const response = await fetch(`${apiBase}/api/admin/notices/${notice.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isPinned: !notice.isPinned })
    })
    if (!response.ok) {
      throw new Error(`更新失败: ${response.status}`)
    }
    await loadNotices()
    toast.add({
      severity: 'success',
      summary: notice.isPinned ? '已取消置顶' : '置顶成功',
      detail: notice.isPinned ? '公告已取消置顶' : '公告已置顶展示',
      life: 2500
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '更新失败',
      detail: error instanceof Error ? error.message : '更新失败',
      life: 3500
    })
  } finally {
    pinningId.value = ''
  }
}

onMounted(() => {
  void loadNotices()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">内容管理</div>
        <h1>通知公告管理</h1>
        <p>发布、编辑与维护通知公告内容。</p>
      </div>
      <div class="head-actions">
        <Button label="刷新" severity="secondary" text size="small" :loading="loading" @click="loadNotices" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section class="panel-grid">
      <section class="vtix-panel">
        <div class="vtix-panel__title">公告列表</div>
        <div class="vtix-panel__content">
          <div v-if="loading" class="notice-list">
            <div v-for="n in 4" :key="`skeleton-${n}`" class="notice-card skeleton-card">
              <div class="skeleton-line lg"></div>
              <div class="skeleton-line sm"></div>
              <div class="skeleton-line xs"></div>
            </div>
          </div>
          <div v-else-if="notices.length === 0" class="empty">暂无公告</div>
          <div v-else class="notice-list">
            <div v-for="item in notices" :key="item.id" class="notice-card">
              <div class="notice-main">
                <div class="notice-title">
                  <span>{{ item.title }}</span>
                  <Tag v-if="item.isPinned" value="置顶" severity="info" rounded />
                </div>
                <div class="notice-meta">
                  <span>{{ item.authorName }}</span>
                  <span v-tooltip.bottom="formatFullTime(item.updatedAt)">
                    {{ formatRelativeTime(item.updatedAt) }}
                  </span>
                </div>
                <div class="notice-desc">{{ trimContent(item.content) || '暂无内容' }}</div>
              </div>
              <div class="notice-actions">
                <Button
                  :label="item.isPinned ? '取消置顶' : '置顶'"
                  size="small"
                  text
                  severity="info"
                  :loading="pinningId === item.id"
                  @click="togglePinned(item)"
                />
                <Button label="编辑" size="small" text severity="secondary" @click="startEdit(item)" />
                <Button label="删除" size="small" text severity="danger" @click="deleteNotice(item)" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="vtix-panel">
        <div class="vtix-panel__title">
          <span>{{ isEditing ? '编辑公告' : '新增公告' }}</span>
          <Tag v-if="isEditing" value="编辑中" rounded severity="secondary" />
        </div>
        <div class="vtix-panel__content">
          <label class="field">
            <span>标题</span>
            <InputText v-model="form.title" placeholder="输入公告标题" />
          </label>
          <label class="field">
            <span>内容</span>
            <Textarea v-model="form.content" rows="8" autoResize placeholder="输入公告内容" />
          </label>
          <div class="form-actions">
            <Button :label="isEditing ? '保存修改' : '发布公告'" :loading="saving" @click="saveNotice" />
            <Button
              v-if="isEditing"
              label="取消编辑"
              severity="secondary"
              text
              @click="resetForm"
            />
            <Button v-else label="重置" severity="secondary" text @click="resetForm" />
          </div>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-head h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.page-head p {
  margin: 0;
  color: var(--vtix-text-muted);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr);
  gap: 16px;
}

.notice-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notice-card {
  border-radius: 14px;
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface-2);
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.notice-card.skeleton-card {
  flex-direction: column;
}

.notice-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.notice-meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--vtix-text-muted);
  margin-top: 4px;
}

.notice-desc {
  font-size: 12px;
  color: var(--vtix-text-muted);
  margin-top: 6px;
}

.notice-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--vtix-text-muted);
  font-weight: 500;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.status {
  border: 1px solid var(--vtix-danger-border);
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  padding: 14px 16px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-title {
  font-weight: 700;
}

.status-detail {
  font-size: 13px;
}

.empty {
  color: var(--vtix-text-subtle);
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.lg {
  height: 18px;
  width: 70%;
}

.skeleton-line.sm {
  width: 40%;
}

.skeleton-line.xs {
  width: 55%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
