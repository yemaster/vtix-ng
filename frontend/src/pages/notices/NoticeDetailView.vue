<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'

type NoticeDetail = {
  id: string
  title: string
  content: string
  authorName: string
  createdAt: number
  updatedAt: number
}

const route = useRoute()
const router = useRouter()
const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const loading = ref(false)
const loadError = ref('')
const notice = ref<NoticeDetail | null>(null)

const createdTimeText = computed(() => formatFullTime(notice.value?.createdAt ?? 0))
const metaText = computed(() => {
  const author = notice.value?.authorName ?? '--'
  const created = createdTimeText.value || '--'
  return `发布人：${author} · 发布时间：${created}`
})
const markdownHtml = computed(() => renderMarkdown(notice.value?.content ?? ''))

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

function escapeAttribute(input: string) {
  return input.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

function sanitizeUrl(raw: string) {
  const url = raw.trim()
  const lower = url.toLowerCase()
  const isSafe =
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('/') ||
    lower.startsWith('./') ||
    lower.startsWith('../')
  return isSafe ? url : '#'
}

function renderInline(input: string) {
  const links: Array<{ placeholder: string; html: string }> = []
  let text = input.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawUrl) => {
    const url = sanitizeUrl(rawUrl)
    const isExternal = /^https?:\/\//i.test(url)
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
    const html = `<a href="${escapeAttribute(url)}"${attrs}>${escapeHtml(label)}</a>`
    const placeholder = `@@LINK${links.length}@@`
    links.push({ placeholder, html })
    return placeholder
  })
  text = escapeHtml(text)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>')
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>')
  text = text.replace(/\*(?!\s)([^*]+?)\*(?!\*)/g, '<em>$1</em>')
  text = text.replace(/_(?!\s)([^_]+?)_(?!_)/g, '<em>$1</em>')
  for (const { placeholder, html } of links) {
    text = text.split(placeholder).join(html)
  }
  return text
}

function renderMarkdown(input: string) {
  const lines = input.split(/\r?\n/)
  return lines
    .map((line) => {
      const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
      if (headingMatch) {
        const hashes = headingMatch[1] ?? ''
        const title = headingMatch[2] ?? ''
        const level = hashes.length
        const tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4'
        return `<${tag}>${renderInline(title)}</${tag}>`
      }
      if (!line.trim()) {
        return '<br />'
      }
      return `<p>${renderInline(line)}</p>`
    })
    .join('\n')
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

async function loadNotice() {
  const id = String(route.params.id ?? '').trim()
  if (!id) {
    loadError.value = '缺少公告编号'
    notice.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/notices/${id}`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as NoticeDetail
    if (!data || !data.title) {
      throw new Error('公告不存在')
    }
    notice.value = {
      id: String(data.id ?? id),
      title: data.title,
      content: data.content ?? '',
      authorName: data.authorName ?? '管理员',
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0)
    }
  } catch (error) {
    notice.value = null
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadNotice()
})

watch(notice, (current) => {
  if (current?.title) {
    document.title = current.title
  }
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <div class="eyebrow">通知公告</div>
        <h1>{{ notice?.title || (loading ? '加载中' : '公告详情') }}</h1>
        <p>{{ metaText }}</p>
      </div>
      <div class="head-actions">
        <Button label="返回" severity="secondary" outlined @click="router.back()" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section v-else class="notice-card">
      <div v-if="loading" class="notice-skeleton">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line meta"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block short"></div>
      </div>
      <div v-else-if="notice" class="notice-content">
        <div class="notice-body p-typography" v-html="markdownHtml"></div>
      </div>
      <div v-else class="empty">暂无公告</div>
    </section>
  </section>
</template>

<style scoped>
.page {
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

.notice-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 30px var(--vtix-shadow);
  min-height: 220px;
}

.notice-body {
  line-height: 1.7;
  color: var(--vtix-text-strong);
}

:deep(.notice-body h2),
:deep(.notice-body h3),
:deep(.notice-body h4) {
  margin: 16px 0 10px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

:deep(.notice-body p) {
  margin: 0 0 10px;
}

:deep(.notice-body a) {
  color: var(--vtix-primary-600);
  text-decoration: underline;
  text-underline-offset: 3px;
}

:deep(.notice-body del) {
  color: var(--vtix-text-muted);
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

.notice-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.title {
  height: 22px;
  width: 55%;
}

.skeleton-line.meta {
  width: 35%;
}

.skeleton-block {
  height: 120px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-block.short {
  height: 80px;
}

.empty {
  color: var(--vtix-text-subtle);
  text-align: center;
  font-size: 13px;
  padding: 12px 0;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 768px) {
  .page-head {
    flex-direction: column;
  }

  .notice-card {
    padding: 18px;
  }
}
</style>
