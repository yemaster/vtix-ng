<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import TabMenu from 'primevue/tabmenu'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '../../stores/user'

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
  { label: '密码设置', value: 'password' }
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
  const last = Number(localStorage.getItem(LAST_LOGIN_KEY))
  const prev = Number(localStorage.getItem(PREV_LOGIN_KEY))
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

async function handleSave() {
  if (!userStore.user) {
    router.push({ name: 'login' })
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
    router.push({ name: 'login' })
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
        <h1>编辑个人资料</h1>
        <p>更新你的显示名称与联系方式。</p>
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
  margin: 8px 0 6px;
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
  font-weight: 600;
  color: var(--vtix-text-muted);
}

.field :deep(.p-inputtext) {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.form-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
