<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import {
  DEFAULT_TEST_SHORTCUTS,
  getShortcutDisplayLabel,
  getTestShortcuts,
  normalizeShortcutEventKey,
  saveTestShortcuts,
  type TestShortcutAction,
  type TestShortcutMap
} from '../../base/testShortcuts'

const shortcutRows: Array<{ action: TestShortcutAction; label: string }> = [
  { action: 'choice0', label: '选项 A' },
  { action: 'choice1', label: '选项 B' },
  { action: 'choice2', label: '选项 C' },
  { action: 'choice3', label: '选项 D' },
  { action: 'choice4', label: '选项 E' },
  { action: 'choice5', label: '选项 F' },
  { action: 'submit', label: '提交答案' },
  { action: 'prev', label: '上一题' },
  { action: 'next', label: '下一题' },
  { action: 'exit', label: '退出浮层' }
]

const quickSteps = [
  { index: '01', title: '选择题库' },
  { index: '02', title: '开始练习' },
  { index: '03', title: '复盘管理' }
]

const shortcuts = ref<TestShortcutMap>(getTestShortcuts())
const editingShortcut = ref<TestShortcutAction | null>(null)
const shortcutMessage = ref('')

function beginShortcutEdit(action: TestShortcutAction) {
  editingShortcut.value = action
  shortcutMessage.value = '请按下新的快捷键'
}

function persistShortcuts(next: TestShortcutMap) {
  const saved = saveTestShortcuts(next)
  if (!saved) {
    shortcutMessage.value = '保存失败，设置未修改'
    return
  }
  shortcuts.value = next
  shortcutMessage.value = '已保存'
}

function resetShortcuts() {
  editingShortcut.value = null
  persistShortcuts({ ...DEFAULT_TEST_SHORTCUTS })
}

function handleShortcutCapture(event: KeyboardEvent) {
  if (!editingShortcut.value) return
  event.preventDefault()
  event.stopPropagation()

  const key = normalizeShortcutEventKey(event)
  if (!key) {
    shortcutMessage.value = '不支持组合键或修饰键'
    return
  }

  const action = editingShortcut.value
  const conflict = shortcutRows.find(
    (item) => item.action !== action && shortcuts.value[item.action] === key
  )
  if (conflict) {
    shortcutMessage.value = `该按键已用于${conflict.label}`
    return
  }

  const next = {
    ...shortcuts.value,
    [action]: key
  }
  editingShortcut.value = null
  persistShortcuts(next)
}

onMounted(() => {
  shortcuts.value = getTestShortcuts()
  window.addEventListener('keydown', handleShortcutCapture, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcutCapture, true)
})
</script>

<template>
  <section class="help-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">帮助中心</div>
        <h1>如何使用 Vtix 答题自测</h1>
      </div>
    </header>

    <section class="quick-row">
      <Card v-for="step in quickSteps" :key="step.index" class="quick-card">
        <template #content>
          <div class="quick-index">{{ step.index }}</div>
          <div class="quick-title">{{ step.title }}</div>
        </template>
      </Card>
    </section>

    <section class="content-grid">
      <div class="guide-section">
        <Card class="help-card feedback-card">
          <template #title>问题反馈 & 提交建议</template>
          <template #content>
            <div class="feedback-grid">
              <a
                class="feedback-channel is-link"
                href="https://qm.qq.com/q/PqwEed4eo8"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="feedback-label">交流 QQ 群</div>
                <div class="feedback-value">1082797665</div>
                <div class="feedback-hint">适合问题讨论与建议收集</div>
              </a>
              <div class="feedback-channel">
                <div class="feedback-label">作者 QQ</div>
                <div class="feedback-value">1440169768</div>
                <div class="feedback-hint">反馈 bug、需求和使用问题</div>
              </div>
              <a
                class="feedback-channel is-link"
                href="https://github.com/yemaster/vtix-ng"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="feedback-label">项目 Github</div>
                <div class="feedback-value">yemaster/vtix-ng</div>
                <div class="feedback-hint">提交 Issue 和 PR</div>
              </a>
            </div>
          </template>
        </Card>
        <Card class="help-card qa-card">
          <template #title>常见问题 Q&A</template>
          <template #content>
            <div class="qa-list">
              <article class="qa-item">
                <div class="qa-q">Q：我一定要登录才能答题吗？</div>
                <div class="qa-a">A：不需要，不登录就可以进行答题，练习记录，错题回顾。不过登录之后可以进行云端同步，自建题库等功能。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：我如何继续之前的练习？</div>
                <div class="qa-a">A：进入题库后，会自动继续最近的一次练习。也可以进入题库的练习记录页面（电脑端点击导航条中的做题记录，手机端点击底部的记录），可以选择练习继续。也可以在做题记录管理页面进入。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：练习记录会自动保存吗？</div>
                <div class="qa-a">A：会。做题过程中会定期保存，离开页面也会自动保存最近记录。登录之后，还可以在云端同步。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：错题如何再次练习？</div>
                <div class="qa-a">A：在“错题管理”中按题库筛选，进入错题回顾模式即可重做。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：如何同步到云端？</div>
                <div class="qa-a">A：登录后在记录页面点击“同步”，即可将本地记录上传并合并云端数据。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：可以导入历史练习记录吗？</div>
                <div class="qa-a">A：可以。在记录页面选择“导入”，上传之前导出的记录文件即可。</div>
              </article>
              <article class="qa-item">
                <div class="qa-q">Q：我还有其他的问题 / 有 bug 需要反馈！</div>
                <div class="qa-a">A：联系 yemaster，在关于页面查看联系方法。</div>
              </article>
            </div>
          </template>
        </Card>
      </div>

      <aside class="side-panel">
        <Card class="side-card">
          <template #title>
            <div class="panel-title-row">
              <span>快捷键</span>
              <Button label="恢复默认" severity="secondary" text size="small" @click="resetShortcuts" />
            </div>
          </template>
          <template #content>
            <div class="shortcut-grid">
              <div v-for="item in shortcutRows" :key="item.action" class="shortcut-item">
                <button
                  type="button"
                  :class="['shortcut-key', { editing: editingShortcut === item.action }]"
                  @click="beginShortcutEdit(item.action)"
                >
                  {{
                    editingShortcut === item.action
                      ? '按键中'
                      : getShortcutDisplayLabel(shortcuts[item.action])
                  }}
                </button>
                <span class="shortcut-text">{{ item.label }}</span>
              </div>
            </div>
            <div v-if="shortcutMessage" class="shortcut-message">{{ shortcutMessage }}</div>
          </template>
        </Card>

        <Card class="side-card">
          <template #title>数据管理</template>
          <template #content>
            <ul class="panel-list">
              <li>记录页支持导入/导出与备份文件下载。</li>
              <li>错题管理支持批量删除与分题库筛选。</li>
              <li>云端同步开启后，跨设备可继续练习。</li>
            </ul>
          </template>
        </Card>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.help-page {
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
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
  margin-top: 4px;
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.quick-card :deep(.p-card-body) {
  padding: 16px 18px;
}

.quick-card :deep(.p-card-content) {
  padding: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.quick-index {
  flex: 0 0 auto;
  font-weight: 700;
  font-size: 13px;
  color: var(--vtix-primary-700);
  background: var(--vtix-primary-100);
  border-radius: 10px;
  padding: 4px 8px;
}

.quick-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}

.guide-section,
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.side-panel {
  position: sticky;
  top: 96px;
}

.help-card,
.side-card {
  overflow: hidden;
}

.help-card :deep(.p-card-body),
.side-card :deep(.p-card-body) {
  gap: 0.85rem;
}

.help-card :deep(.p-card-title),
.side-card :deep(.p-card-title) {
  color: var(--vtix-text-strong);
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.35;
}

.qa-card :deep(.p-card-body) {
  padding-bottom: 0;
}

.qa-card :deep(.p-card-content) {
  padding: 0;
}

.qa-list {
  display: flex;
  flex-direction: column;
  margin: 0 -1.25rem;
}

.qa-item {
  padding: 14px 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qa-item + .qa-item {
  border-top: 1px solid var(--vtix-border);
}

.qa-q {
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 14px;
}

.qa-a {
  color: var(--vtix-text-muted);
  font-size: 13px;
  line-height: 1.65;
}

.feedback-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.feedback-channel {
  padding: 0 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
  position: relative;
}

.feedback-channel:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 0;
  bottom: 2px;
  width: 1px;
  background: var(--vtix-border-strong);
}

.feedback-channel.is-link {
  text-decoration: none;
  color: inherit;
  transition: color 0.2s ease;
}

.feedback-channel.is-link:hover {
  color: var(--vtix-primary-700);
}

.feedback-label {
  font-size: 12px;
  color: var(--vtix-text-subtle);
}

.feedback-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--vtix-text-strong);
  line-height: 1.2;
  word-break: break-word;
}

.feedback-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--vtix-text-muted);
  line-height: 1.5;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.shortcut-grid {
  display: grid;
  gap: 10px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.shortcut-key {
  font-weight: 700;
  color: var(--vtix-text-strong);
  background: var(--vtix-surface-3);
  border-radius: 10px;
  padding: 4px 8px;
  border: 1px solid var(--vtix-border-strong);
  min-width: 72px;
  text-align: center;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
}

.shortcut-key:hover,
.shortcut-key.editing {
  color: var(--vtix-primary-700);
  border-color: var(--vtix-primary-300);
  background: var(--vtix-primary-50);
}

.shortcut-message {
  color: var(--vtix-text-subtle);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 10px;
}

.panel-list {
  margin: 0;
  padding-left: 16px;
  color: var(--vtix-text-muted);
  font-size: 12px;
  display: grid;
  gap: 6px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .side-panel {
    position: static;
  }

  .feedback-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .feedback-channel {
    min-height: 0;
    padding: 0;
  }

  .feedback-channel:not(:last-child)::after {
    display: none;
  }
}
</style>
