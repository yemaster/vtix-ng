<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import TabMenu from 'primevue/tabmenu'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'
import { getStorageItem } from '../../base/vtixGlobal'
import { pushLoginRequired } from '../../utils/auth'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const userStore = useUserStore()

const nameField = ref('')
const emailField = ref('')
const saving = ref(false)
const passwordSaving = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const editTabs = [
  { label: '基本信息设置', value: 'basic' },
  { label: '密码设置', value: 'password' },
  { label: 'AI 设置', value: 'ai' }
]
const activeTab = ref('basic')
const tabItems = editTabs.map((tab) => ({
  label: tab.label,
  command: () => {
    activeTab.value = tab.value
  }
}))
const activeTabIndex = computed(() => editTabs.findIndex((tab) => tab.value === activeTab.value))

const LAST_LOGIN_KEY = 'vtixLastLoginAt'
const PREV_LOGIN_KEY = 'vtixPrevLoginAt'
const lastLoginAt = ref<number | null>(null)
const prevLoginAt = ref<number | null>(null)

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

type AiProtocol = 'openai' | 'anthropic'

type AiSettings = {
  aiApiBase: string
  aiProtocol: AiProtocol
  aiModel: string
  aiRequestTimeoutMs: number | null
  hasApiKey: boolean
  defaults: {
    aiApiBase: string
    aiProtocol: AiProtocol
    aiModel: string
    aiRequestTimeoutMs: number
  }
  modelOptions?: Array<{
    label: string
    value: string
  }>
}

const aiLoading = ref(false)
const aiSaving = ref(false)
const aiProviderMode = ref<'school' | 'custom'>('school')
const aiApiBase = ref('')
const aiApiKey = ref('')
const aiProtocol = ref<AiProtocol>('openai')
const aiModel = ref('')
const aiRequestTimeoutMs = ref<number | null>(null)
const aiHasApiKey = ref(false)
const aiDefaults = ref<{ aiApiBase: string; aiProtocol: AiProtocol; aiModel: string; aiRequestTimeoutMs: number } | null>(null)
const aiKeyEditing = ref(false)
const aiKeyVisible = ref(false)
const aiModelLoading = ref(false)
const aiModelLoadError = ref('')
const aiProtocolOptions = [
  { label: 'OpenAI 兼容', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' }
]
const fallbackAiModelOptions = [
  { label: 'deepseek-v4-flash-ascend', value: 'deepseek-v4-flash-ascend' }
]
const aiModelOptions = ref(fallbackAiModelOptions)
const aiRequestTimeoutMsField = computed({
  get: () => (aiRequestTimeoutMs.value === null ? '' : String(aiRequestTimeoutMs.value)),
  set: (value: string | number | null) => {
    const raw = String(value ?? '').trim()
    if (!raw) {
      aiRequestTimeoutMs.value = null
      return
    }
    const parsed = Number(raw)
    aiRequestTimeoutMs.value = Number.isFinite(parsed) ? parsed : null
  }
})
const selectedAiProviderLabel = computed(() =>
  aiProviderMode.value === 'school'
    ? '学校平台'
    : `其他服务商（${aiProtocol.value === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}）`
)

function mergeModelOptions(
  options: Array<{ label: string; value: string }>,
  config: { includeFallback?: boolean } = {}
) {
  const next = options.length
    ? [...options]
    : config.includeFallback
      ? [...fallbackAiModelOptions]
      : []
  const current = aiModel.value.trim()
  if (current && !next.some((item) => item.value === current)) {
    next.unshift({ label: current, value: current })
  }
  aiModelOptions.value = next
  if (!aiModel.value && next[0]) {
    aiModel.value = next[0].value
  }
}

const routeName = computed(() => {
  const raw = route.params.name
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
})

const isSelf = computed(() => {
  const current = userStore.user?.name
  return Boolean(current && routeName.value && current === routeName.value)
})

function loadLoginInfo() {
  const last = Number(getStorageItem(LAST_LOGIN_KEY))
  const prev = Number(getStorageItem(PREV_LOGIN_KEY))
  lastLoginAt.value = Number.isFinite(last) && last > 0 ? last : null
  prevLoginAt.value = Number.isFinite(prev) && prev > 0 ? prev : null
}

function formatTimestamp(value?: number | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function syncForm() {
  nameField.value = userStore.user?.name ?? ''
  emailField.value = userStore.user?.email ?? ''
}

async function loadAiSettings() {
  if (!userStore.user) return
  aiLoading.value = true
  try {
    const response = await fetch(`${apiBase}/api/me/ai-settings`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      void pushLoginRequired(router)
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as AiSettings
    aiDefaults.value = data.defaults ?? null
    aiApiBase.value = data.aiApiBase ?? ''
    aiProtocol.value = data.aiProtocol || data.defaults?.aiProtocol || 'openai'
    aiRequestTimeoutMs.value = data.aiRequestTimeoutMs ?? null
    aiProviderMode.value =
      data.aiApiBase && data.aiApiBase !== data.defaults?.aiApiBase ? 'custom' : 'school'
    aiModel.value =
      data.aiModel ||
      (aiProviderMode.value === 'school' ? data.defaults?.aiModel || aiModelOptions.value[0]?.value || '' : '')
    mergeModelOptions(aiProviderMode.value === 'school' && data.modelOptions?.length ? data.modelOptions : [], {
      includeFallback: aiProviderMode.value === 'school'
    })
    aiHasApiKey.value = data.hasApiKey
    aiApiKey.value = ''
    aiKeyEditing.value = false
    aiKeyVisible.value = false
    void loadAiModelOptions({ silent: true })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '加载失败',
      detail: error instanceof Error ? error.message : '无法加载 AI 配置',
      life: 4000
    })
  } finally {
    aiLoading.value = false
  }
}

function startEditApiKey() {
  aiKeyEditing.value = true
  aiApiKey.value = ''
  aiKeyVisible.value = false
}

function cancelEditApiKey() {
  aiKeyEditing.value = false
  aiApiKey.value = ''
  aiKeyVisible.value = false
}

function selectAiProviderMode(mode: 'school' | 'custom') {
  aiProviderMode.value = mode
  aiModelLoadError.value = ''
  if (mode === 'school') {
    aiProtocol.value = aiDefaults.value?.aiProtocol || 'openai'
    aiModel.value = aiDefaults.value?.aiModel || aiModelOptions.value[0]?.value || ''
    mergeModelOptions(fallbackAiModelOptions, { includeFallback: true })
  } else {
    aiModel.value = ''
    mergeModelOptions([])
  }
  void loadAiModelOptions({ silent: true })
}

async function loadAiModelOptions(options: { silent?: boolean } = {}) {
  if (!userStore.user) return
  aiModelLoading.value = true
  aiModelLoadError.value = ''
  const payload: Record<string, unknown> = {}
  if (aiProviderMode.value === 'custom') {
    payload.aiApiBase = aiApiBase.value.trim()
    payload.aiProtocol = aiProtocol.value
    payload.aiRequestTimeoutMs = aiRequestTimeoutMs.value
  } else {
    payload.aiApiBase = ''
    payload.aiProtocol = aiDefaults.value?.aiProtocol || 'openai'
    payload.aiRequestTimeoutMs = null
  }
  if (aiKeyEditing.value && aiApiKey.value.trim()) {
    payload.aiApiKey = aiApiKey.value.trim()
  }

  try {
    const response = await fetch(`${apiBase}/api/me/ai-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (response.status === 401) {
      void pushLoginRequired(router)
      return
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : `加载失败: ${response.status}`)
    }
    mergeModelOptions(Array.isArray(data.modelOptions) ? data.modelOptions : [], {
      includeFallback: aiProviderMode.value === 'school'
    })
  } catch (error) {
    aiModelLoadError.value = error instanceof Error ? error.message : '无法加载模型列表'
    if (!options.silent) {
      toast.add({
        severity: 'warn',
        summary: '模型列表加载失败',
        detail: aiModelLoadError.value,
        life: 4000
      })
    }
  } finally {
    aiModelLoading.value = false
  }
}

async function handleAiSave() {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  const payload: Record<string, unknown> = {}
  if (aiProviderMode.value === 'custom') {
    payload.aiApiBase = aiApiBase.value.trim()
    payload.aiProtocol = aiProtocol.value
    payload.aiRequestTimeoutMs = aiRequestTimeoutMs.value
  } else {
    payload.aiApiBase = ''
    payload.aiProtocol = aiDefaults.value?.aiProtocol || 'openai'
    payload.aiRequestTimeoutMs = null
  }
  if (aiModel.value !== '') {
    payload.aiModel = aiModel.value.trim()
  } else {
    payload.aiModel = ''
  }
  if (aiKeyEditing.value) {
    payload.aiApiKey = aiApiKey.value.trim()
  }

  aiSaving.value = true
  try {
    const response = await fetch(`${apiBase}/api/me/ai-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (response.status === 401) {
      void pushLoginRequired(router)
      return
    }
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`)
    }
    const data = (await response.json()) as Partial<AiSettings>
    aiApiBase.value = data.aiApiBase ?? ''
    aiProtocol.value = data.aiProtocol || aiDefaults.value?.aiProtocol || 'openai'
    aiRequestTimeoutMs.value = data.aiRequestTimeoutMs ?? null
    aiModel.value =
      data.aiModel ||
      (aiProviderMode.value === 'school' ? aiDefaults.value?.aiModel || aiModelOptions.value[0]?.value || '' : '')
    aiProviderMode.value =
      data.aiApiBase && data.aiApiBase !== aiDefaults.value?.aiApiBase ? 'custom' : 'school'
    mergeModelOptions(aiProviderMode.value === 'school' && data.modelOptions?.length ? data.modelOptions : [], {
      includeFallback: aiProviderMode.value === 'school'
    })
    aiHasApiKey.value = Boolean(data.hasApiKey)
    aiKeyEditing.value = false
    aiKeyVisible.value = false
    aiApiKey.value = ''
    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: 'AI 配置已更新',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存 AI 配置失败',
      life: 4000
    })
  } finally {
    aiSaving.value = false
  }
}

async function handleSave() {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  const name = nameField.value.trim()
  const email = emailField.value.trim()
  if (!name && !email) {
    toast.add({
      severity: 'warn',
      summary: '无法保存',
      detail: '请至少填写用户名或邮箱',
      life: 3000
    })
    return
  }
  saving.value = true
  const ok = await userStore.updateProfile({ name, email })
  saving.value = false
  if (ok) {
    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '个人信息已更新',
      life: 3000
    })
    const nextName = userStore.user?.name || routeName.value
    router.push({ name: 'user-space', params: { name: nextName } })
    return
  }
  toast.add({
    severity: 'error',
    summary: '保存失败',
    detail: userStore.error || '保存失败',
    life: 4000
  })
}

function handlePasswordSave() {
  if (!userStore.user) {
    void pushLoginRequired(router)
    return
  }
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    toast.add({
      severity: 'warn',
      summary: '无法保存',
      detail: '请填写完整的密码信息',
      life: 3000
    })
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.add({
      severity: 'warn',
      summary: '无法保存',
      detail: '两次输入的新密码不一致',
      life: 3000
    })
    return
  }
  passwordSaving.value = true
  setTimeout(() => {
    passwordSaving.value = false
    toast.add({
      severity: 'info',
      summary: '功能完善中',
      detail: '密码修改功能正在上线，敬请期待',
      life: 3000
    })
  }, 200)
}

function handleCancel() {
  if (userStore.user?.name) {
    router.push({ name: 'user-space', params: { name: userStore.user.name } })
  } else {
    router.push({ name: 'home' })
  }
}

watch(
  () => userStore.user,
  () => {
    syncForm()
  }
)

watch(activeTab, (next) => {
  if (next === 'ai' && userStore.user && !aiDefaults.value && !aiLoading.value) {
    void loadAiSettings()
  }
})

onMounted(() => {
  syncForm()
  loadLoginInfo()
  if (userStore.user && !isSelf.value) {
    router.replace({ name: 'user-edit', params: { name: userStore.user.name } })
  }
})
</script>

<template>
  <section class="edit-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">个人信息</div>
        <h1>设置</h1>
        <p>管理你的资料、密码与 AI 解析配置。</p>
      </div>
    </header>

    <TabMenu class="edit-tabs" :model="tabItems" :activeIndex="activeTabIndex" />

    <div class="panel-stack">
      <div v-if="activeTab === 'basic'" class="panel-card">
        <div class="panel-title">基础信息</div>
        <div v-if="!userStore.user" class="panel-empty">
          <p>请先登录后修改个人资料。</p>
          <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
        </div>
        <div v-else class="form-stack">
          <div class="form-section">
            <div class="section-title">可编辑信息</div>
            <div class="form-grid">
              <label class="field">
                <span>用户名</span>
                <InputText v-model="nameField" placeholder="请输入用户名" />
              </label>
              <label class="field">
                <span>邮箱</span>
                <InputText v-model="emailField" placeholder="请输入邮箱" />
              </label>
            </div>
          </div>
          <div class="form-section">
            <div class="section-title">账号信息</div>
            <div class="form-grid readonly">
              <label class="field">
                <span>用户组</span>
                <InputText :modelValue="userStore.user.groupName" disabled />
              </label>
              <label class="field">
                <span>用户ID</span>
                <InputText :modelValue="userStore.user.id" disabled />
              </label>
              <label class="field">
                <span>本次登录</span>
                <InputText :modelValue="formatTimestamp(lastLoginAt)" disabled />
              </label>
              <label class="field">
                <span>上次登录</span>
                <InputText :modelValue="formatTimestamp(prevLoginAt)" disabled />
              </label>
            </div>
          </div>
          <div class="form-actions">
            <Button label="取消" severity="secondary" text size="small" @click="handleCancel" />
            <Button label="保存" size="small" :loading="saving" @click="handleSave" />
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'ai'" class="panel-card">
        <div class="panel-title">AI 解析配置</div>
        <div v-if="!userStore.user" class="panel-empty">
          <p>请先登录后配置 AI。</p>
          <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
        </div>
        <div v-else class="form-stack">
          <div class="form-section">
            <div class="section-title">服务商</div>
            <div class="form-hint">
              默认使用中科大大模型公共服务平台；需要更快或更便宜的服务时，可切换到 OpenAI 兼容或 Anthropic 服务商。
            </div>
            <div class="provider-toggle" role="group" aria-label="AI 服务商">
              <button
                type="button"
                :class="['provider-option', { active: aiProviderMode === 'school' }]"
                :disabled="aiLoading || aiSaving"
                @click="selectAiProviderMode('school')"
              >
                学校平台
              </button>
              <button
                type="button"
                :class="['provider-option', { active: aiProviderMode === 'custom' }]"
                :disabled="aiLoading || aiSaving"
                @click="selectAiProviderMode('custom')"
              >
                其他服务商
              </button>
            </div>
            <div class="form-hint active-config-hint">
              保存后将使用：{{ selectedAiProviderLabel }}
            </div>
            <div class="form-grid">
              <label v-if="aiProviderMode === 'custom'" class="field">
                <span>接口类型</span>
                <Select
                  v-model="aiProtocol"
                  :options="aiProtocolOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="请选择接口类型"
                  :disabled="aiLoading || aiSaving || aiModelLoading"
                  @change="loadAiModelOptions()"
                />
              </label>
              <label class="field">
                <span>服务地址</span>
                <InputText
                  v-if="aiProviderMode === 'custom'"
                  v-model="aiApiBase"
                  placeholder="OpenAI 兼容填 https://api.example.com/v1；Anthropic 填 https://api.anthropic.com"
                  :disabled="aiLoading || aiSaving"
                />
                <InputText v-else :modelValue="aiDefaults?.aiApiBase || 'https://api.llm.ustc.edu.cn/v1'" disabled />
              </label>
              <label class="field">
                <span>模型</span>
                <div class="model-row">
                  <Select
                    v-model="aiModel"
                    :options="aiModelOptions"
                    optionLabel="label"
                    optionValue="value"
                    editable
                    placeholder="请选择模型"
                    :disabled="aiLoading || aiSaving || aiModelLoading"
                  />
                  <Button
                    label="刷新模型"
                    severity="secondary"
                    size="small"
                    text
                    :loading="aiModelLoading"
                    :disabled="aiLoading || aiSaving"
                    @click="loadAiModelOptions()"
                  />
                </div>
                <div v-if="aiModelLoadError" class="form-hint">
                  模型列表加载失败时，可直接输入模型名称。
                </div>
              </label>
              <label v-if="aiProviderMode === 'custom'" class="field">
                <span>请求超时（毫秒）</span>
                <InputText
                  v-model="aiRequestTimeoutMsField"
                  type="number"
                  placeholder="30000"
                  :disabled="aiLoading || aiSaving"
                />
              </label>
            </div>
            <div class="field">
              <span>API 密钥</span>
              <div v-if="!aiKeyEditing" class="api-key-row">
                <InputText
                  :modelValue="aiHasApiKey ? '••••••••（已设置）' : ''"
                  :placeholder="aiHasApiKey ? '' : '未设置'"
                  disabled
                />
                <Button
                  :label="aiHasApiKey ? '修改密钥' : '设置密钥'"
                  severity="secondary"
                  size="small"
                  text
                  :disabled="aiLoading || aiSaving"
                  @click="startEditApiKey"
                />
              </div>
              <div v-else class="api-key-row">
                <InputText
                  v-model="aiApiKey"
                  :type="aiKeyVisible ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="输入 API Key；留空则清除已有密钥"
                  :disabled="aiSaving"
                />
                <Button
                  :icon="aiKeyVisible ? 'pi pi-eye-slash' : 'pi pi-eye'"
                  severity="secondary"
                  size="small"
                  text
                  class="api-key-toggle"
                  :aria-label="aiKeyVisible ? '隐藏 API 密钥' : '显示 API 密钥'"
                  :disabled="aiSaving"
                  @click="aiKeyVisible = !aiKeyVisible"
                />
                <Button
                  label="取消"
                  severity="secondary"
                  size="small"
                  text
                  :disabled="aiSaving"
                  @click="cancelEditApiKey"
                />
              </div>
            </div>
          </div>
          <div class="form-actions">
            <Button label="取消" severity="secondary" text size="small" @click="handleCancel" />
            <Button label="保存并使用" size="small" :loading="aiSaving" @click="handleAiSave" />
          </div>
        </div>
      </div>

      <div v-else class="panel-card">
        <div class="panel-title">密码设置</div>
        <div v-if="!userStore.user" class="panel-empty">
          <p>请先登录后修改密码。</p>
          <Button label="立即登录" size="small" @click="router.push({ name: 'login' })" />
        </div>
        <div v-else class="form-stack">
          <div class="form-section">
            <div class="section-title">修改密码</div>
            <div class="form-grid">
              <label class="field">
                <span>当前密码</span>
                <InputText v-model="currentPassword" type="password" autocomplete="current-password" />
              </label>
              <label class="field">
                <span>新密码</span>
                <InputText v-model="newPassword" type="password" autocomplete="new-password" />
              </label>
              <label class="field">
                <span>确认新密码</span>
                <InputText v-model="confirmPassword" type="password" autocomplete="new-password" />
              </label>
            </div>
            <div class="form-hint">建议使用 8 位以上的组合密码，提高账号安全性。</div>
          </div>
          <div class="form-actions">
            <Button label="取消" severity="secondary" text size="small" @click="handleCancel" />
            <Button
              label="保存密码"
              size="small"
              :loading="passwordSaving"
              @click="handlePasswordSave"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.edit-page {
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
  margin: 4px 0 6px;
  font-size: 28px;
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
  margin-top: 4px;
}

.edit-tabs :deep(.p-tabmenu-nav) {
  border: none;
  background: transparent;
  gap: 10px;
}

.edit-tabs :deep(.p-tabmenuitem-link) {
  border-radius: 10px;
  border: 1px solid transparent;
  color: var(--vtix-text-muted);
  font-weight: 700;
  padding: 8px 14px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.edit-tabs :deep(.p-tabmenuitem.p-highlight .p-tabmenuitem-link) {
  background: var(--vtix-surface-5);
  color: var(--vtix-text-strong);
  border-color: var(--vtix-border);
}

.edit-tabs :deep(.p-tabmenuitem-link:hover) {
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 14px 28px var(--vtix-shadow);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-title {
  font-weight: 700;
  color: inherit;
}

.panel-empty {
  text-align: center;
  color: var(--vtix-text-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.form-grid.readonly :deep(.p-inputtext) {
  background: var(--vtix-surface-2);
  color: var(--vtix-text-muted);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vtix-text-muted);
}

.field :deep(.p-inputtext),
.field :deep(.p-select) {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.active-config-hint {
  color: var(--vtix-text-strong);
  font-weight: 600;
}

.form-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.provider-toggle {
  display: inline-flex;
  width: fit-content;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--vtix-border);
  border-radius: 10px;
  background: var(--vtix-surface-2);
}

.provider-option {
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vtix-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 7px 12px;
}

.provider-option.active {
  background: var(--vtix-surface);
  color: var(--vtix-text-strong);
  box-shadow: 0 1px 4px var(--vtix-shadow);
}

.provider-option:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.api-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-key-row :deep(.p-inputtext) {
  flex: 1;
}

.api-key-toggle {
  flex: 0 0 auto;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-row :deep(.p-select) {
  flex: 1;
  min-width: 0;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
