<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'

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
const submitError = ref('')
const saving = ref(false)
const showModal = ref(false)

const form = ref({
  id: '',
  name: '',
  email: '',
  groupId: ''
})

const search = ref('')
const selectedGroup = ref('all')
const pageSize = ref(8)
const currentPage = ref(1)

const isEditing = computed(() => Boolean(form.value.id))
const groupOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...groups.value.map((group) => ({ label: group.name, value: group.id }))
])

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
    groupId: groups.value[0]?.id ?? ''
  }
  submitError.value = ''
}

function startEdit(user: AdminUser) {
  form.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    groupId: user.groupId
  }
  submitError.value = ''
  showModal.value = true
}

function startCreate() {
  form.value = {
    id: '',
    name: '',
    email: '',
    groupId: groups.value[0]?.id ?? ''
  }
  submitError.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  resetForm()
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
    if (!form.value.groupId && groups.value.length) {
      form.value.groupId = groups.value[0].id
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
  submitError.value = ''
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      email: form.value.email.trim(),
      groupId: form.value.groupId
    }
    if (!payload.name && !payload.email) {
      submitError.value = '请输入用户名称或邮箱'
      return
    }
    const url = isEditing.value
      ? `${apiBase}/api/admin/users/${form.value.id}`
      : `${apiBase}/api/admin/users`
    const method = isEditing.value ? 'PUT' : 'POST'
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`)
    }
    await loadData()
    closeModal()
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadData()
})

watch([search, selectedGroup, pageSize], () => {
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
        <Dropdown
          v-model="selectedGroup"
          :options="groupOptions"
          optionLabel="label"
          optionValue="value"
          class="group-filter"
        />
      </div>
      <div class="filter-group">
        <span>每页</span>
        <Dropdown
          v-model="pageSize"
          :options="[{ label: '8', value: 8 }, { label: '16', value: 16 }, { label: '32', value: 32 }]"
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
            <Button
              label="上一页"
              severity="secondary"
              text
              size="small"
              :disabled="currentPage === 1"
              @click="currentPage -= 1"
            />
            <div class="pages">
              <Button
                v-for="page in totalPages"
                :key="page"
                type="button"
                :label="String(page)"
                :severity="page === currentPage ? 'contrast' : 'secondary'"
                :outlined="page !== currentPage"
                size="small"
                class="page-btn"
                @click="currentPage = page"
              />
            </div>
            <Button
              label="下一页"
              severity="secondary"
              text
              size="small"
              :disabled="currentPage === totalPages"
              @click="currentPage += 1"
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
            <span>用户组</span>
            <Dropdown
              v-model="form.groupId"
              :options="groupOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="请选择用户组"
              class="group-select"
            />
          </label>
          <div v-if="submitError" class="form-error">{{ submitError }}</div>
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
  color: #0f172a;
}

.page-head p {
  margin: 0;
  color: #6b7280;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
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
  color: #475569;
  font-size: 13px;
  font-weight: 600;
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
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  color: #0f172a;
}

.user-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.pages {
  display: flex;
  gap: 6px;
}

.page-btn :deep(.p-button) {
  border-radius: 10px;
  font-size: 14px;
}

.status {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
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
  color: #94a3b8;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.group-select :deep(.p-dropdown) {
  width: 100%;
}

.form-error {
  color: #b91c1c;
  font-size: 13px;
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
  background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
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
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
}

.modal-card {
  width: min(520px, 100%);
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
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
  color: #0f172a;
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
