<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import RadioButton from 'primevue/radiobutton'
import Tag from 'primevue/tag'
import { useUserStore } from '../../stores/user'
import type { ProblemType } from '../../base/ProblemTypes'

type ProblemDraft = {
  id: string
  type: number
  content: string
  choices: string[]
  answerSingle: number | null
  answerMulti: number[]
  answerText: string
  hint: string
}

type ProblemPayload = ProblemType & { hint?: string }

type ProblemSetDetail = {
  title: string
  year: number
  categories: string[]
  isPublic: boolean
  inviteCode: string | null
  problems: ProblemType[]
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const MANAGE_QUESTION_BANK_ALL = 1 << 10

const title = ref('')
const year = ref(new Date().getFullYear())
const categoriesText = ref('')
const isPublic = ref(false)
const inviteCode = ref('')

const problems = ref<ProblemDraft[]>([])
const selectedProblemId = ref<string | null>(null)
const loadError = ref('')
const loadLoading = ref(true)
const submitError = ref('')
const submitLoading = ref(false)

const canManage = computed(
  () => Boolean(userStore.user?.permissions && (userStore.user.permissions & MANAGE_QUESTION_BANK_ALL))
)

const typeOptions = [
  { label: '单选题', value: 1 },
  { label: '多选题', value: 2 },
  { label: '填空题', value: 3 },
  { label: '判断题', value: 4 }
]

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createProblem(type = 1): ProblemDraft {
  const choices = type === 4 ? ['正确', '错误'] : type === 3 ? [] : ['', '', '', '']
  return {
    id: createId(),
    type,
    content: '',
    choices,
    answerSingle: null,
    answerMulti: [],
    answerText: '',
    hint: ''
  }
}

function addProblem(type = 1) {
  const item = createProblem(type)
  problems.value.push(item)
  selectedProblemId.value = item.id
}

function removeProblem(index: number) {
  const removed = problems.value.splice(index, 1)
  if (!removed.length) return
  if (selectedProblemId.value === removed[0].id) {
    selectedProblemId.value = problems.value[0]?.id ?? null
  }
}

function updateType(problem: ProblemDraft, nextType: number) {
  problem.type = nextType
  problem.content = ''
  problem.hint = ''
  problem.answerSingle = null
  problem.answerMulti = []
  problem.answerText = ''
  if (nextType === 3) {
    problem.choices = []
  } else if (nextType === 4) {
    problem.choices = ['正确', '错误']
  } else {
    problem.choices = ['', '', '', '']
  }
}

function addChoice(problem: ProblemDraft) {
  problem.choices.push('')
}

function removeChoice(problem: ProblemDraft, index: number) {
  problem.choices.splice(index, 1)
  if (problem.answerSingle !== null && problem.answerSingle >= problem.choices.length) {
    problem.answerSingle = null
  }
  problem.answerMulti = problem.answerMulti.filter((value) => value < problem.choices.length)
}

function toggleMultiAnswer(problem: ProblemDraft, index: number) {
  const set = new Set(problem.answerMulti)
  if (set.has(index)) {
    set.delete(index)
  } else {
    set.add(index)
  }
  problem.answerMulti = Array.from(set).sort((a, b) => a - b)
}

function normalizeChoices(list: string[]) {
  return list.map((item) => item.trim())
}

function buildProblemPayload(problem: ProblemDraft): ProblemPayload | null {
  const content = problem.content.trim()
  if (!content) return null
  const hint = problem.hint.trim()
  if (problem.type === 3) {
    const answer = problem.answerText.trim()
    if (!answer) return null
    return hint ? { type: 3, content, answer, hint } : { type: 3, content, answer }
  }
  const choices = normalizeChoices(problem.choices)
  if (choices.length < 2 || choices.some((item) => !item)) return null
  if (problem.type === 2) {
    const answer = problem.answerMulti.filter((value) => value >= 0 && value < choices.length)
    if (!answer.length) return null
    return hint ? { type: 2, content, choices, answer, hint } : { type: 2, content, choices, answer }
  }
  const answer = problem.answerSingle
  if (answer === null || answer < 0 || answer >= choices.length) return null
  if (problem.type === 4) {
    const pair: [string, string] = [choices[0], choices[1]]
    return hint ? { type: 4, content, choices: pair, answer, hint } : { type: 4, content, choices: pair, answer }
  }
  return hint ? { type: 1, content, choices, answer, hint } : { type: 1, content, choices, answer }
}

function ensureChoices(type: number, raw: unknown) {
  const choices = Array.isArray(raw) ? raw.map((item) => String(item)) : []
  if (type === 4) {
    return choices.length >= 2 ? [choices[0], choices[1]] : ['正确', '错误']
  }
  if (!choices.length) {
    return ['', '', '', '']
  }
  if (choices.length < 2) {
    return [...choices, '']
  }
  return choices
}

function toDraft(problem: ProblemType): ProblemDraft {
  const base: ProblemDraft = {
    id: createId(),
    type: problem.type,
    content: problem.content ?? '',
    choices: [],
    answerSingle: null,
    answerMulti: [],
    answerText: '',
    hint: problem.hint ?? ''
  }
  if (problem.type === 3) {
    base.answerText = String(problem.answer ?? '')
    base.choices = []
    return base
  }
  base.choices = ensureChoices(problem.type, problem.choices)
  if (problem.type === 2) {
    const answer = Array.isArray(problem.answer) ? problem.answer : []
    base.answerMulti = answer.filter((value) => Number.isFinite(value))
    return base
  }
  const answer = typeof problem.answer === 'number' ? problem.answer : null
  if (answer !== null && answer >= 0 && answer < base.choices.length) {
    base.answerSingle = answer
  }
  return base
}

const stats = computed(() => {
  const counts = [0, 0, 0, 0, 0]
  for (const problem of problems.value) {
    if (problem.type >= 0 && problem.type <= 4) {
      counts[problem.type] += 1
    }
  }
  return counts
})

const isFormValid = computed(() => {
  if (!title.value.trim()) return false
  if (!problems.value.length) return false
  return problems.value.every((problem) => Boolean(buildProblemPayload(problem)))
})

async function loadDetail() {
  loadError.value = ''
  loadLoading.value = true
  try {
    const code = String(route.params.code ?? '')
    if (!code) {
      loadError.value = '题库编号缺失'
      return
    }
    const response = await fetch(`${apiBase}/api/problem-sets/${code}`, {
      credentials: 'include'
    })
    if (response.status === 401) {
      router.push({ name: 'login' })
      return
    }
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as ProblemSetDetail
    title.value = data.title ?? ''
    year.value = Number.isFinite(data.year) ? data.year : new Date().getFullYear()
    categoriesText.value = Array.isArray(data.categories) ? data.categories.join(',') : ''
    isPublic.value = Boolean(data.isPublic)
    inviteCode.value = data.inviteCode ?? ''
    problems.value = Array.isArray(data.problems) ? data.problems.map(toDraft) : []
    if (!problems.value.length) {
      addProblem(1)
    } else {
      selectedProblemId.value = problems.value[0]?.id ?? null
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loadLoading.value = false
  }
}

async function handleSubmit() {
  if (!userStore.user) {
    router.push({ name: 'login' })
    return
  }
  submitError.value = ''
  submitLoading.value = true
  try {
    const code = String(route.params.code ?? '')
    if (!code) {
      throw new Error('题库编号缺失')
    }
    const problemPayload = problems.value
      .map(buildProblemPayload)
      .filter((item): item is ProblemPayload => Boolean(item))
    if (!problemPayload.length) {
      submitError.value = '请至少完善一道题目。'
      return
    }
    const counts = [0, 0, 0, 0, 0]
    for (const item of problemPayload) {
      if (item.type >= 0 && item.type <= 4) {
        counts[item.type] += 1
      }
    }
    const payload = {
      title: title.value.trim(),
      year: year.value,
      categories: categoriesText.value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      isPublic: canManage.value ? isPublic.value : false,
      inviteCode: isPublic.value ? null : inviteCode.value.trim() || null,
      problems: problemPayload,
      test: counts,
      score: [0, 1, 2, 1, 1]
    }
    const response = await fetch(`${apiBase}/api/problem-sets/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`)
    }
    router.push({ name: 'my-question-bank' })
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '保存失败'
  } finally {
    submitLoading.value = false
  }
}

const selectedProblem = computed(() =>
  problems.value.find((item) => item.id === selectedProblemId.value) ?? null
)

onMounted(() => {
  void loadDetail()
})
</script>

<template>
  <section class="page">
    <form class="page-form" @submit.prevent="handleSubmit">
      <header class="page-head">
        <div>
          <div class="eyebrow">题库编辑</div>
          <h1>编辑你的题库</h1>
          <p>更新题库信息与题目内容，支持单选、多选、填空和判断题。</p>
        </div>
        <div class="page-actions">
          <Button label="返回我的题库" severity="secondary" text size="small" @click="router.push({ name: 'my-question-bank' })" />
        </div>
      </header>

      <div v-if="loadError" class="status">
        <div class="status-icon">!</div>
        <div class="status-body">
          <div class="status-title">加载失败</div>
          <div class="status-detail">{{ loadError }}</div>
        </div>
        <Button label="重新加载" severity="danger" text size="small" @click="loadDetail" />
      </div>

      <div v-else-if="loadLoading" class="loading">正在加载题库...</div>

      <template v-else>
        <section class="vtix-panel">
          <div class="vtix-panel__title">题库信息</div>
          <div class="vtix-panel__content">
            <div class="info-grid">
              <label class="field">
                <span>题库名称</span>
                <InputText v-model="title" placeholder="例如：2025 思政自测" />
              </label>
              <label class="field">
                <span>年份</span>
                <InputNumber v-model="year" :useGrouping="false" />
              </label>
              <label class="field">
                <span>分类（逗号分隔）</span>
                <InputText v-model="categoriesText" placeholder="例如：政治,考试" />
              </label>
              <label v-if="canManage" class="field">
                <span>公开题库</span>
                <div class="toggle-row">
                  <Checkbox v-model="isPublic" :binary="true" />
                  <span class="toggle-label">{{ isPublic ? '公开' : '非公开' }}</span>
                </div>
              </label>
              <label v-if="!isPublic" class="field">
                <span>邀请码（可选）</span>
                <InputText v-model="inviteCode" placeholder="留空则无法通过邀请码访问" />
              </label>
            </div>
            <div class="info-stats">
              <Tag severity="info" rounded>总题数 {{ problems.length }}</Tag>
              <Tag severity="secondary" rounded>单选 {{ stats[1] }}</Tag>
              <Tag severity="secondary" rounded>多选 {{ stats[2] }}</Tag>
              <Tag severity="secondary" rounded>填空 {{ stats[3] }}</Tag>
              <Tag severity="secondary" rounded>判断 {{ stats[4] }}</Tag>
            </div>
          </div>
        </section>

        <div class="problem-layout">
          <section class="problem-editor-card vtix-panel">
            <div class="vtix-panel__title">
              <span>题目编辑</span>
              <Button label="添加题目" size="small" @click="addProblem(1)" />
            </div>
            <div class="vtix-panel__content">
              <div v-if="!selectedProblem" class="empty">请选择右侧题号开始编辑</div>
              <div v-else class="problem-card">
                <div class="problem-head">
                  <div class="problem-index">
                    题目 {{ problems.findIndex((item) => item.id === selectedProblem.id) + 1 }}
                  </div>
                  <div class="problem-controls">
                    <Dropdown
                      v-model="selectedProblem.type"
                      :options="typeOptions"
                      optionLabel="label"
                      optionValue="value"
                      class="type-select"
                      @change="updateType(selectedProblem, selectedProblem.type)"
                    />
                    <Button
                      label="删除"
                      severity="danger"
                      text
                      size="small"
                      @click="removeProblem(problems.findIndex((item) => item.id === selectedProblem.id))"
                    />
                  </div>
                </div>

                <label class="field choice-content-field">
                  <span>题目内容</span>
                  <Textarea v-model="selectedProblem.content" rows="3" autoResize placeholder="请输入题干" />
                </label>

                <div v-if="selectedProblem.type !== 3" class="choice-block">
                  <div class="choice-title">选项</div>
                  <div class="choice-list">
                    <div
                      v-for="(choice, cIndex) in selectedProblem.choices"
                      :key="`${selectedProblem.id}-choice-${cIndex}`"
                      class="choice-item"
                    >
                      <InputText v-model="selectedProblem.choices[cIndex]" placeholder="选项内容" />
                      <div class="choice-answer">
                        <RadioButton
                          v-if="selectedProblem.type === 1 || selectedProblem.type === 4"
                          :name="`${selectedProblem.id}-answer`"
                          :value="cIndex"
                          v-model="selectedProblem.answerSingle"
                        />
                        <Checkbox
                          v-else
                          :binary="true"
                          :modelValue="selectedProblem.answerMulti.includes(cIndex)"
                          @update:modelValue="toggleMultiAnswer(selectedProblem, cIndex)"
                        />
                        <span>正确</span>
                      </div>
                      <Button
                        v-if="selectedProblem.type !== 4"
                        label="删除选项"
                        severity="secondary"
                        text
                        size="small"
                        @click="removeChoice(selectedProblem, cIndex)"
                      />
                    </div>
                  </div>
                  <div v-if="selectedProblem.type !== 4" class="choice-actions">
                    <Button label="添加选项" size="small" severity="secondary" text @click="addChoice(selectedProblem)" />
                  </div>
                </div>

                <label v-else class="field">
                  <span>参考答案</span>
                  <InputText v-model="selectedProblem.answerText" placeholder="填空答案，多个答案用逗号分隔" />
                </label>

                <label class="field">
                  <span>解析（可选）</span>
                  <InputText v-model="selectedProblem.hint" placeholder="可填写提示或解析" />
                </label>
              </div>
            </div>
          </section>

          <section class="problem-indexes-card vtix-panel vtix-list-panel">
            <div class="vtix-panel__title">题号</div>
            <div class="vtix-panel__content">
              <div class="vtix-number-grid">
                <button
                  v-for="(problem, index) in problems"
                  :key="problem.id"
                  type="button"
                  :class="['vtix-number-btn', { active: problem.id === selectedProblemId }]"
                  @click="selectedProblemId = problem.id"
                >
                  {{ index + 1 }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div v-if="submitError" class="error">{{ submitError }}</div>

        <div class="footer-actions">
          <Button label="保存修改" :loading="submitLoading" :disabled="!isFormValid" @click="handleSubmit" />
        </div>
      </template>
    </form>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.page-form {
  display: flex;
  flex-direction: column;
  gap: 28px;
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

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.field :deep(.p-inputtext) {
  width: 100%;
}

.field :deep(.p-inputnumber) {
  width: 100%;
}

.field :deep(.p-inputtextarea) {
  width: 100%;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.toggle-label {
  font-weight: 600;
  color: #0f172a;
}

.info-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
}

.problem-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.problem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e2e8f0;
}

.problem-index {
  font-weight: 700;
  color: #0f172a;
}

.problem-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.type-select :deep(.p-dropdown) {
  min-width: 140px;
}

label.field.choice-content-field {
  margin-top: 12px;
}

.problem-card .field {
  margin-top: 16px;
}

.choice-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.choice-title {
  font-weight: 700;
  color: #0f172a;
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choice-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.choice-answer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #475569;
}

.choice-actions {
  display: flex;
  justify-content: flex-end;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.error {
  color: #b91c1c;
  font-size: 13px;
}

.problem-editor-card {
  background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
}

.status {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border-radius: 16px;
  width: 100%;
}

.status-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #fee2e2;
  color: #b91c1c;
  display: grid;
  place-items: center;
  font-weight: 800;
}

.status-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.status-title {
  font-weight: 800;
}

.status-detail {
  font-weight: 500;
  color: #b91c1c;
}

.loading {
  border: 1px dashed #e5e7eb;
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .problem-layout {
    grid-template-columns: 1fr;
  }

  .vtix-list-panel :deep(.p-card-content) {
    max-height: none;
  }

  .choice-item {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }
}
</style>
