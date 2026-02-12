<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

type UserGroup = {
  id: string
  name: string
  description: string
  permissions: number
  privateProblemSetLimit: number
  recordCloudLimit: number
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const groups = ref<UserGroup[]>([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const toast = useToast()

const form = ref({
  id: '',
  name: '',
  description: '',
  permissions: 0,
  privateProblemSetLimit: -1,
  recordCloudLimit: -1
})

const permissionOptions = [
  { label: '登录', value: 1 << 0 },
  { label: '公开题库', value: 1 << 1 },
  { label: '私有题库', value: 1 << 2 },
  { label: '记录', value: 1 << 3 },
  { label: '错题', value: 1 << 4 },
  { label: '题库（自己的）', value: 1 << 9 },
  { label: '题库（全部）', value: 1 << 10 },
  { label: '用户管理', value: 1 << 11 },
  { label: '通知公告管理', value: 1 << 12 }
]

const isEditing = computed(() => Boolean(form.value.id))

function hasPermission(value: number) {
  return (form.value.permissions & value) === value
}

function togglePermission(value: number) {
  if (hasPermission(value)) {
    form.value.permissions &= ~value
  } else {
    form.value.permissions |= value
  }
}

function formatPermissionTags(permissions: number) {
  return permissionOptions.filter((option) => (permissions & option.value) === option.value)
}

function resetForm() {
  form.value = {
    id: '',
    name: '',
    description: '',
    permissions: 0,
    privateProblemSetLimit: -1,
    recordCloudLimit: -1
  }
}

function startEdit(group: UserGroup) {
  form.value = {
    id: group.id,
    name: group.name,
    description: group.description ?? '',
    permissions: group.permissions ?? 0,
    privateProblemSetLimit:
      Number.isFinite(group.privateProblemSetLimit) ? group.privateProblemSetLimit : -1,
    recordCloudLimit:
      Number.isFinite(group.recordCloudLimit) ? group.recordCloudLimit : -1
  }
}

function cancelEdit() {
  resetForm()
}

async function loadGroups() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/admin/user-groups`, {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as UserGroup[]
    groups.value = Array.isArray(data) ? data : []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
    groups.value = []
  } finally {
    loading.value = false
  }
}

async function saveGroup() {
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      permissions: form.value.permissions,
      privateProblemSetLimit: Number(form.value.privateProblemSetLimit),
      recordCloudLimit: Number(form.value.recordCloudLimit)
    }
    if (!payload.name) {
      toast.add({
        severity: 'warn',
        summary: '无法保存',
        detail: '请输入用户组名称',
        life: 3000
      })
      return
    }
    const url = isEditing.value
      ? `${apiBase}/api/admin/user-groups/${form.value.id}`
      : `${apiBase}/api/admin/user-groups`
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
    await loadGroups()
    resetForm()
    toast.add({
      severity: 'success',
      summary: isEditing.value ? '保存成功' : '创建成功',
      detail: isEditing.value ? '用户组已更新' : '用户组已创建',
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
  void loadGroups()
})
</script>

<template>
  <section class="admin-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">用户相关</div>
        <h1>用户组管理</h1>
        <p>新增、编辑用户组，配置名称、权限和描述。</p>
      </div>
      <div class="head-actions">
        <Button label="刷新" severity="secondary" text size="small" :loading="loading" @click="loadGroups" />
      </div>
    </header>

    <div v-if="loadError" class="status">
      <div class="status-title">加载失败</div>
      <div class="status-detail">{{ loadError }}</div>
    </div>

    <section class="panel-grid">
      <section class="vtix-panel">
        <div class="vtix-panel__title">用户组列表</div>
        <div class="vtix-panel__content">
          <div v-if="loading" class="group-list">
            <div v-for="n in 4" :key="`skeleton-${n}`" class="group-card skeleton-card">
              <div class="skeleton-line lg"></div>
              <div class="skeleton-line sm"></div>
              <div class="skeleton-tags">
                <span class="skeleton-pill"></span>
                <span class="skeleton-pill"></span>
                <span class="skeleton-pill"></span>
              </div>
            </div>
          </div>
          <div v-else-if="groups.length === 0" class="empty">暂无用户组</div>
          <div v-else class="group-list">
            <div v-for="group in groups" :key="group.id" class="group-card">
              <div class="group-main">
                <div class="group-name">{{ group.name }}</div>
                <div class="group-desc">{{ group.description || '暂无描述' }}</div>
                <div class="group-limit">
                  非公开题库上限：
                  <span>{{ group.privateProblemSetLimit === -1 ? '不限' : group.privateProblemSetLimit }}</span>
                </div>
                <div class="group-limit">
                  云存档上限：
                  <span>{{ group.recordCloudLimit === -1 ? '不限' : group.recordCloudLimit }}</span>
                </div>
                <div class="group-tags">
                  <Tag v-for="item in formatPermissionTags(group.permissions)" :key="item.value" :value="item.label" />
                </div>
              </div>
              <div class="group-actions">
                <Button label="编辑" size="small" text severity="secondary" @click="startEdit(group)" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="vtix-panel">
        <div class="vtix-panel__title">
          <span>{{ isEditing ? '编辑用户组' : '新增用户组' }}</span>
          <Button
            v-if="isEditing"
            icon="pi pi-times"
            severity="secondary"
            text
            size="small"
            @click="cancelEdit"
          />
        </div>
        <div class="vtix-panel__content">
          <label class="field">
            <span>用户组名称</span>
            <InputText v-model="form.name" placeholder="例如：内容管理员" />
          </label>
          <label class="field">
            <span>描述</span>
            <Textarea v-model="form.description" rows="3" autoResize placeholder="填写用户组说明" />
          </label>
          <label class="field">
            <span>非公开题库上限（-1 表示无限制）</span>
            <InputNumber
              v-model="form.privateProblemSetLimit"
              :useGrouping="false"
              :min="-1"
              :step="1"
              placeholder="例如：-1 或 5"
            />
          </label>
          <label class="field">
            <span>云存档记录上限（-1 表示无限制）</span>
            <InputNumber
              v-model="form.recordCloudLimit"
              :useGrouping="false"
              :min="-1"
              :step="1"
              placeholder="例如：-1 或 50"
            />
          </label>
          <div class="field">
            <span>权限配置</span>
            <div class="permission-grid">
              <label v-for="option in permissionOptions" :key="option.value" class="permission-item">
                <Checkbox
                  :binary="true"
                  :modelValue="hasPermission(option.value)"
                  @update:modelValue="togglePermission(option.value)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
          <div class="form-actions">
            <Button
              :label="isEditing ? '保存修改' : '新增用户组'"
              :loading="saving"
              @click="saveGroup"
            />
            <Button v-if="isEditing" label="取消编辑" severity="secondary" text @click="cancelEdit" />
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

.group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-card {
  border-radius: 14px;
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface-2);
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.group-card.skeleton-card {
  flex-direction: column;
}

.group-name {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.group-desc {
  font-size: 12px;
  color: var(--vtix-text-muted);
  margin-top: 4px;
}

.group-limit {
  margin-top: 6px;
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.group-limit span {
  color: var(--vtix-text);
  font-weight: 600;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.group-actions {
  display: flex;
  align-items: flex-start;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--vtix-text-muted);
  font-weight: 600;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.permission-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--vtix-border-strong);
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
  font-weight: 600;
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
  width: 60%;
}

.skeleton-line.sm {
  width: 40%;
}

.skeleton-tags {
  display: flex;
  gap: 6px;
}

.skeleton-pill {
  width: 48px;
  height: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vtix-border-strong), var(--vtix-surface-2), var(--vtix-border-strong));
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
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
