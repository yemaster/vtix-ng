<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'

const route = useRoute()
const router = useRouter()

const reasonMap: Record<number, string> = {
  400: '请求错误',
  401: '未授权',
  403: '无权限访问',
  404: '页面未找到',
  500: '服务器错误',
  502: '网关错误',
  503: '服务不可用',
  504: '请求超时'
}

function readQueryValue(key: string) {
  const value = route.query[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

function readMetaValue(key: string) {
  const metaValue = (route.meta as Record<string, unknown>)[key]
  if (typeof metaValue === 'number') return String(metaValue)
  return typeof metaValue === 'string' ? metaValue : ''
}

const statusCode = computed(() => {
  const raw = readQueryValue('code') || readMetaValue('code')
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed)) return parsed
  if (route.name === 'not-found') return 404
  return 500
})

const targetPath = computed(() => {
  const raw = readQueryValue('path')
  return raw || route.fullPath || '/'
})

const reason = computed(() => {
  const raw = readQueryValue('reason') || readMetaValue('reason')
  if (raw) return raw
  return reasonMap[statusCode.value] || '发生错误'
})

const message = computed(() => {
  const raw = readQueryValue('message') || readMetaValue('message')
  if (raw) return raw
  if (statusCode.value === 404) {
    return `未找到地址：${targetPath.value}`
  }
  if (statusCode.value === 503) {
    return '后端服务不可达，请稍后再试。'
  }
  if (statusCode.value >= 500) {
    return '服务响应异常，请稍后再试。'
  }
  return '请求未能完成，请稍后再试。'
})

const subtitle = computed(() => {
  if (statusCode.value === 404) return '可能地址拼写有误，或页面已被移除。'
  if (statusCode.value === 503) return '请确认服务已启动，并检查网络连接。'
  return '你可以返回上一页或回到首页继续浏览。'
})

function handleBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push({ name: 'home' })
}
</script>

<template>
  <section class="error-page">
    <div class="error-card">
      <div class="error-top">
        <div class="error-code">{{ statusCode }}</div>
        <div class="error-head">
          <div class="eyebrow">出现错误</div>
          <h1>{{ reason }}</h1>
          <p>{{ subtitle }}</p>
        </div>
      </div>

      <div class="error-details">
        <div class="detail-item">
          <div class="detail-label">错误原因</div>
          <div class="detail-value">{{ reason }}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">错误信息</div>
          <div class="detail-value">{{ message }}</div>
        </div>
      </div>

      <div class="error-actions">
        <Button label="返回" severity="secondary" text @click="handleBack" />
        <Button label="返回首页" @click="router.push({ name: 'home' })" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.error-page {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, var(--vtix-glow-primary-soft), transparent 55%),
    radial-gradient(circle at bottom right, var(--vtix-glow-primary-strong), transparent 50%),
    linear-gradient(180deg, var(--vtix-surface-2) 0%, var(--vtix-surface-4) 100%);
  border-radius: 0;
  overflow: auto;
  z-index: 30;
}

.error-card {
  width: min(900px, 100%);
  background: var(--vtix-surface);
  border-radius: 24px;
  border: 1px solid var(--vtix-border);
  padding: 26px 26px 24px;
  box-shadow: 0 24px 48px var(--vtix-shadow-strong);
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.error-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--vtix-glow-primary-soft), transparent 45%);
  pointer-events: none;
}

.error-top {
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
}

.error-code {
  min-width: 120px;
  text-align: center;
  padding: 16px 18px;
  border-radius: 20px;
  font-size: 42px;
  font-weight: 800;
  color: var(--vtix-text-strong);
  background: linear-gradient(135deg, var(--vtix-primary-100), var(--vtix-surface));
  border: 1px solid var(--vtix-primary-200);
  box-shadow: 0 12px 24px var(--vtix-shadow-accent);
}

.error-head h1 {
  margin: 8px 0 6px;
  font-size: 28px;
  color: var(--vtix-text-strong);
}

.error-head p {
  margin: 0;
  color: var(--vtix-text-muted);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.error-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  position: relative;
  z-index: 1;
}

.detail-item {
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border-strong);
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.detail-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--vtix-text-strong);
  white-space: pre-wrap;
}

.error-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

@media (max-width: 720px) {
  .error-page {
    padding: 18px;
  }

  .error-card {
    padding: 20px;
  }

  .error-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .error-code {
    min-width: auto;
    font-size: 34px;
  }
}
</style>
