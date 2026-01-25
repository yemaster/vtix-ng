<script setup lang="ts">
import { ref } from 'vue'

const name = ref('')
const email = ref('')
const password = ref('')
</script>

<template>
  <div class="auth-page">
    <div class="auth-wrapper">
      <div class="auth-intro">
        <p class="brand">VTIX 票务系统</p>
        <h1>创建账号</h1>
        <p class="subtitle">建立你的活动空间，开始筹备下一场演出。</p>
      </div>

      <div class="auth-card">
        <div class="card-title">
          <span>账号注册</span>
          <small>填写信息后即可快速开启</small>
        </div>

        <form class="form" autocomplete="on">
          <label class="field">
            <span>姓名</span>
            <input
              v-model="name"
              name="name"
              type="text"
              placeholder="你的名字"
              required
            />
          </label>

          <label class="field">
            <span>邮箱</span>
            <input
              v-model="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label class="field">
            <span>密码</span>
            <input
              v-model="password"
              name="password"
              type="password"
              placeholder="至少 8 位"
              required
            />
          </label>

          <button type="submit" class="action primary">
            注册
          </button>

          <div class="hint">
            已有账号？
            <RouterLink to="/login">前去登录</RouterLink>
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
  background: linear-gradient(135deg, #f7fbff 0%, #f2f3f5 70%);
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
  background: radial-gradient(circle at 60% 70%, #f7fbff 0%, #d4e6ff 25%, transparent 75%);
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
  color: #0f172a;
}

.auth-intro h1 {
  font-size: 36px;
  margin: 8px 0 12px;
  color: #0f172a;
}

.auth-intro .brand {
  font-weight: 600;
  letter-spacing: 1px;
  color: #2563eb;
}

.auth-intro .subtitle {
  color: #0f172a;
  opacity: 0.7;
  line-height: 1.6;
}

.auth-card {
  position: relative;
  width: 100%;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.14);
  border-radius: 18px;
  padding: 30px;
}

.card-title span {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #111827;
}

.card-title small {
  color: #6b7280;
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
  color: #1f2937;
  letter-spacing: 0.01em;
}

.field input {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f7f7f8;
  color: #111827;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.25s ease;
}

.field input:focus {
  outline: none;
  border-color: #7eb3ff;
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 0 0 3px rgba(126, 179, 255, 0.25);
}

.action {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #e5e7eb;
  color: #111827;
  padding: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.action.primary:hover {
  background: #dfe3e8;
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.12);
}

.action:focus-visible {
  outline: none;
  background: #dfe3e8;
  color: #0f172a;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.35);
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
  color: #6b7280;
  font-size: 14px;
}

.hint a {
  color: #111827;
  font-weight: 700;
}

.hint.subtle {
  margin-top: 6px;
  font-size: 13px;
  color: #9ca3af;
}
</style>
