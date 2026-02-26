<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'

const name = ref('')
const email = ref('')
const password = ref('')
const router = useRouter()
const userStore = useUserStore()
const toast = useToast()

async function handleSubmit() {
  const nameValue = name.value.trim()
  const emailValue = email.value.trim()
  const passwordValue = password.value
  if (!nameValue || !emailValue || !passwordValue) {
    toast.add({
      severity: 'warn',
      summary: '信息不完整',
      detail: '请填写姓名、邮箱与密码',
      life: 3000
    })
    return
  }
  const ok = await userStore.register({
    name: nameValue,
    email: emailValue,
    password: passwordValue
  })
  if (!ok) {
    toast.add({
      severity: 'error',
      summary: '注册失败',
      detail: userStore.error || '注册失败，请稍后再试',
      life: 3500
    })
    return
  }
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-wrapper">
      <div class="auth-intro">
        <p class="brand">VTIX 题库自测</p>
        <h1>创建练习账号</h1>
        <p class="subtitle">建立你的练习档案，随时记录答题进度与错题。</p>
      </div>

      <div class="auth-card">
        <div class="card-title">
          <span>账号注册</span>
          <small>填写信息后即可开始练习</small>
        </div>

        <form class="form" autocomplete="on" @submit.prevent="handleSubmit">
          <label class="field">
            <span>姓名</span>
            <InputText
              v-model="name"
              name="name"
              type="text"
              placeholder="你的名字"
              required
            />
          </label>

          <label class="field">
            <span>邮箱</span>
            <InputText
              v-model="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label class="field">
            <span>密码</span>
            <Password
              v-model="password"
              :feedback="false"
              name="password"
              placeholder="至少 8 位"
              required
            />
          </label>

          <Button
            type="submit"
            label="注册"
            class="action primary"
            :loading="userStore.loading"
          />

          <div class="hint">
            已有账号？
            <RouterLink :to="{ name: 'login' }">前去登录</RouterLink>
          </div>
          <div class="hint subtle">
            <RouterLink to="/">返回首页</RouterLink>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background: var(--vtix-auth-bg-cool);
  overflow: hidden;
  transition: background 0.5s ease;
}

.auth-page::before {
  content: '';
  position: absolute;
  width: 200vmax;
  height: 200vmax;
  bottom: -120vmax;
  right: -120vmax;
  background: var(--vtix-auth-spot-cool);
  transform: scale(0);
  transform-origin: 100% 100%;
  transition: transform 0.6s ease;
  pointer-events: none;
}

.auth-page:focus-within::before {
  transform: scale(1);
}

.auth-wrapper {
  width: min(960px, 100%);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 32px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.auth-intro {
  color: var(--vtix-text-strong);
}

.auth-intro h1 {
  font-size: 36px;
  margin: 8px 0 12px;
  color: var(--vtix-text-strong);
}

.auth-intro .brand {
  font-weight: 500;
  letter-spacing: 1px;
  color: var(--vtix-auth-accent-cool);
}

.auth-intro .subtitle {
  color: var(--vtix-text-strong);
  opacity: 0.7;
  line-height: 1.6;
}

.auth-card {
  position: relative;
  width: 100%;
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  box-shadow: 0 24px 60px var(--vtix-shadow-strong);
  border-radius: 18px;
  padding: 30px;
}

.card-title span {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--vtix-text);
}

.card-title small {
  color: var(--vtix-text-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 6px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 700;
  color: var(--vtix-text-strong);
  letter-spacing: 0.01em;
}

.field :deep(.p-inputtext),
.field :deep(.p-password),
.field :deep(.p-password-input) {
  width: 100%;
}

.field :deep(.p-inputtext),
.field :deep(.p-password-input) {
  border: 1px solid var(--vtix-input-border);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--vtix-surface-4);
  color: var(--vtix-text);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.25s ease;
}

.field :deep(.p-inputtext:focus),
.field :deep(.p-password-input:focus) {
  outline: none;
  border-color: var(--vtix-auth-focus-cool);
  background: var(--vtix-surface);
  color: var(--vtix-text-strong);
  box-shadow: 0 0 0 3px var(--vtix-auth-focus-ring-cool);
}

.form :deep(.action.p-button) {
  width: 100%;
  border: 1px solid var(--vtix-input-border);
  border-radius: 12px;
  background: var(--vtix-border);
  color: var(--vtix-text);
  padding: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.form :deep(.action.primary.p-button:hover) {
  background: var(--vtix-surface-3);
  transform: translateY(-1px);
  box-shadow: 0 12px 26px var(--vtix-shadow-strong);
}

.form :deep(.action.p-button:focus-visible) {
  outline: none;
  background: var(--vtix-surface-3);
  color: var(--vtix-text-strong);
  box-shadow: 0 0 0 3px var(--vtix-auth-focus-ring-cool);
}

@media (max-width: 768px) {
  .auth-wrapper {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .auth-card {
    box-shadow: none;
  }

}

.hint {
  text-align: center;
  color: var(--vtix-text-muted);
  font-size: 14px;
}

.hint a {
  color: var(--vtix-text);
  font-weight: 700;
}

.hint.subtle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--vtix-text-subtle);
}
</style>
