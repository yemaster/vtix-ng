<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import type { PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'

type UserGroup = {
  id: string
  name: string
  permissions: number
}

type AdminUser = {
  id: string
  name: string
  email: string
  groupId: string
  groupName: string
  permissions: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const users = ref<AdminUser[]>([])
const groups = ref<UserGroup[]>([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const showModal = ref(false)
const toast = useToast()

const form = ref({
  id: '',
  name: '',
  email: '',
  groupId: '',
  password: ''
})

const search = ref('')
const selectedGroup = ref('all')
const pageSize = ref(8)
const currentPage = ref(1)
const pageSizeOptions = [8, 16, 32]

const isEditing = computed(() => Boolean(form.value.id))
const groupFilterOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...groups.value.map((group) => ({ label: group.name, value: group.id }))
])
const groupSelectOptions = computed(() =>
  groups.value.map((group) => ({ label: group.name, value: group.id }))
)

const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const passwordRefreshing = ref(false)
let passwordRefreshTimer = 0

function generateRandomPassword(length = 16) {
  const randomValues = new Uint32Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('')
}

function refreshPassword() {
  form.value.password = generateRandomPassword()
  passwordRefreshing.value = false
  window.clearTimeout(passwordRefreshTimer)
  window.requestAnimationFrame(() => {
    passwordRefreshing.value = true
    passwordRefreshTimer = window.setTimeout(() => {
      passwordRefreshing.value = false
    }, 480)
  })
}

async function readErrorDetail(response: Response) {
  const status = `HTTP ${response.status}`
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { error?: string; message?: string; detail?: string }
      const detail = data.error || data.message || data.detail
      if (detail) {
        return `${detail}（${status}）`
      }
    } else {
      const text = (await response.text()).trim()
      if (text) {
        return `${text}（${status}）`
      }
    }
  } catch {
    // ignore parse errors and use fallback below
  }
  return `请求失败（${status}）`
}

const filteredUsers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return users.value.filter((user) => {
    const matchGroup = selectedGroup.value === 'all' || user.groupId === selectedGroup.value
    const matchKeyword =
      !keyword ||
      user.name.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword)
    return matchGroup && matchKeyword
  })
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredUsers.value.length / pageSize.value))
)

const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredUsers.value.slice(start, start + pageSize.value)
})

function resetForm() {
  form.value = {
    id: '',
    name: '',
    email: '',
    groupId: groups.value[0]?.id ?? '',
    password: generateRandomPassword()
  }
}

function startEdit(user: AdminUser) {
  form.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    groupId: user.groupId,
    password: ''
  }
  showModal.value = true
}

function startCreate() {
  form.value = {
    id: '',
    name: '',
    email: '',
    groupId: groups.value[0]?.id ?? '',
    password: generateRandomPassword()
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  resetForm()
}

function handlePage(event: PageState) {
  if (typeof event.rows === 'number') {
    pageSize.value = event.rows
  }
  const page = event.page ?? 0
  currentPage.value = page + 1
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const [groupsRes, usersRes] = await Promise.all([
      fetch(`${apiBase}/api/admin/user-groups`, { credentials: 'include' }),
      fetch(`${apiBase}/api/admin/users`, { credentials: 'include' })
    ])
    if (!groupsRes.ok) {
      throw new Error(`加载用户组失败: ${groupsRes.status}`)
    }
    if (!usersRes.ok) {
      throw new Error(`加载用户失败: ${usersRes.status}`)
    }
    const groupData = (await groupsRes.json()) as UserGroup[]
    const userData = (await usersRes.json()) as AdminUser[]
    groups.value = Array.isArray(groupData) ? groupData : []
    users.value = Array.isArray(userData) ? userData : []
    if ((!form.value.groupId || form.value.groupId === 'all') && groups.value.length) {
      form.value.groupId = groups.value[0]?.id ?? ''
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    groups.value = []
    users.value = []
  } finally {
    loading.value = false
  }
}

async function saveUser() {
  saving.value = true
  try {
    const editing = isEditing.value
    const payload = {
      name: form.value.name.trim(),
      email: form.value.email.trim(),
      groupId: form.value.groupId,
      password: form.value.password
    }
    if (!payload.name && !payload.email) {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请输入用户名称或邮箱',
        life: 3000
      })
      return
    }
    if (!payload.groupId || payload.groupId === 'all') {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请选择具体用户组',
        life: 3000
      })
      return
    }
    if (!editing && !payload.password) {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请先生成密码',
        life: 3000
      })
      return
    }
    const url = editing
      ? `${apiBase}/api/admin/users/${form.value.id}`
      : `${apiBase}/api/admin/users`
    const method = editing ? 'PUT' : 'POST'
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(await readErrorDetail(response))
    }
    await loadData()
    closeModal()
    toast.add({
      severity: 'success',
      summary: editing ? '保存成功' : '创建成功',
      detail: editing ? '用户已更新' : '用户已创建',
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

onMounted(() => {
  void loadData()
})

watch([search, selectedGroup], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">用户相关</div>
        <h1>用户管理</h1>
        <p>编辑用户信息并调整用户所属用户组。</p>
      </div>
      <div class="head-actions">
        <Button label="新增用户" size="small" @click="startCreate" />
        <Button label="刷新" severity="secondary" text size="small" :loading="loading" @click="loadData" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section class="filters">
      <div class="search">
        <InputText v-model="search" placeholder="搜索用户名称或邮箱" />
      </div>
      <div class="filter-group">
        <span>用户组</span>
        <Select
          v-model="selectedGroup"
          :options="groupFilterOptions"
          optionLabel="label"
          optionValue="value"
          class="group-filter"
        />
      </div>
    </section>

    <section class="panel-grid">
      <section class="vtix-panel table-panel">
        <div class="vtix-panel__title">用户列表</div>
        <div class="vtix-panel__content">
          <div v-if="loading" class="table-skeleton">
            <div v-for="n in 6" :key="`row-${n}`" class="skeleton-row">
              <span class="skeleton-line sm"></span>
              <span class="skeleton-line lg"></span>
              <span class="skeleton-line sm"></span>
              <span class="skeleton-line sm"></span>
              <span class="skeleton-line sm"></span>
            </div>
          </div>
          <div v-else-if="filteredUsers.length === 0" class="empty">暂无用户</div>
          <div v-else class="table-wrap">
            <table class="user-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>邮箱</th>
                  <th>用户组</th>
                  <th>权限值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in pagedUsers" :key="user.id">
                  <td>{{ user.name }}</td>
                  <td>{{ user.email || '未填写邮箱' }}</td>
                  <td>{{ user.groupName }}</td>
                  <td>{{ user.permissions }}</td>
                  <td>
                    <Button label="编辑" size="small" text severity="secondary" @click="startEdit(user)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <Paginator
              :first="(currentPage - 1) * pageSize"
              :rows="pageSize"
              :totalRecords="filteredUsers.length"
              :rowsPerPageOptions="pageSizeOptions"
              template="PrevPageLink PageLinks NextPageLink RowsPerPageSelect"
              @page="handlePage"
            />
          </div>
        </div>
      </section>
    </section>

    <div v-if="showModal" class="modal-backdrop" @click="closeModal">
      <div class="modal-card" @click.stop>
        <div class="modal-head">
          <div class="modal-title">{{ isEditing ? '编辑用户' : '新增用户' }}</div>
          <Button icon="pi pi-times" severity="secondary" text @click="closeModal" />
        </div>
        <div class="modal-body">
          <label class="field">
            <span>用户名称</span>
            <InputText v-model="form.name" placeholder="请输入用户名称" />
          </label>
          <label class="field">
            <span>邮箱</span>
            <InputText v-model="form.email" placeholder="请输入邮箱" />
          </label>
          <label class="field">
            <span>密码</span>
            <div class="password-field">
              <InputText
                v-model="form.password"
                readonly
                class="password-input"
                :placeholder="isEditing ? '留空表示不修改密码' : ''"
              />
              <Button
                icon="pi pi-sync"
                severity="secondary"
                text
                rounded
                aria-label="随机生成密码"
                class="password-refresh-btn"
                :class="{ 'is-spinning': passwordRefreshing }"
                @click="refreshPassword"
              />
            </div>
            <span v-if="isEditing" class="field-hint">密码留空表示不修改密码。</span>
          </label>
          <label class="field">
            <span>用户组</span>
            <Select
              v-model="form.groupId"
              :options="groupSelectOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="请选择用户组"
              class="group-select"
            />
          </label>
        </div>
        <div class="modal-actions">
          <Button
            :label="isEditing ? '保存修改' : '新增用户'"
            :loading="saving"
            @click="saveUser"
          />
          <Button label="取消" severity="secondary" text @click="closeModal" />
        </div>
      </div>
    </div>
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

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search {
  flex: 1;
  min-width: 220px;
}

.filter-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--vtix-text-muted);
  font-size: 13px;
  font-weight: 500;
}

.group-filter {
  min-width: 160px;
}

.panel-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.table-panel :deep(.vtix-panel__content) {
  gap: 16px;
}

.table-wrap {
  width: 100%;
  overflow: auto;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

.user-table th,
.user-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--vtix-border);
  font-size: 14px;
  color: var(--vtix-text-strong);
}

.user-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vtix-text-subtle);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
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

.pagination :deep(.p-paginator-rpp-select),
.pagination :deep(.p-paginator-rpp-dropdown) {
  border-radius: 8px;
}

.pagination :deep(.p-select-label),
.pagination :deep(.p-dropdown-label) {
  font-size: 12px;
  color: var(--vtix-text-muted);
  padding: 4px 8px;
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

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--vtix-text-muted);
  font-weight: 500;
}

.group-select :deep(.p-select),
.group-select :deep(.p-dropdown) {
  width: 100%;
}

.password-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.password-input {
  flex: 1;
}

.field-hint {
  font-size: 12px;
  color: var(--vtix-text-subtle);
  font-weight: 400;
}

.password-refresh-btn :deep(.p-button-icon) {
  transition: transform 0.25s ease;
}

.password-refresh-btn:hover :deep(.p-button-icon) {
  transform: rotate(100deg);
}

.password-refresh-btn.is-spinning :deep(.p-button-icon) {
  animation: sync-spin 0.48s ease;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr 0.6fr 0.6fr;
  gap: 12px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.skeleton-line.lg {
  height: 16px;
}

.skeleton-line.sm {
  width: 100%;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--vtix-backdrop);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
}

.modal-card {
  width: min(520px, 100%);
  background: var(--vtix-surface);
  border-radius: 16px;
  border: 1px solid var(--vtix-border);
  box-shadow: 0 20px 40px var(--vtix-shadow-heavy);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes sync-spin {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .filters {
    align-items: stretch;
  }

  .filter-group {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
