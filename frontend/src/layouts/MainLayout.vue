<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="left-group">
          <div class="brand">
            <span class="brand-dot" />
            <span class="brand-word">VTIX</span>
          </div>
        <nav class="nav">
          <RouterLink :to="{ name: 'home' }">首页</RouterLink>
          <RouterLink :to="{ name: 'question-bank' }">题库</RouterLink>
        </nav>
        </div>
        <div class="actions">
          <RouterLink to="/login" class="ghost">登录</RouterLink>
          <RouterLink to="/register" class="primary">开始使用</RouterLink>
        </div>
      </div>
    </header>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  width: 100%;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #e5e7eb;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.topbar-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.left-group {
  display: inline-flex;
  align-items: center;
  gap: 18px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.08em;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(120deg, #1f2937, #4b5563);
  display: inline-block;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.15);
}

.brand-word {
  font-size: 14px;
}

.nav {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}

.nav a {
  color: #111827;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 10px;
  transition: background 0.2s ease, color 0.2s ease;
}

.nav a:hover,
.nav :global(a.router-link-exact-active) {
  background: #f1f3f6;
  color: #0f172a;
}

.nav .muted {
  color: #6b7280;
}

.actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.actions .ghost,
.actions .primary {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  text-decoration: none;
}

.actions .ghost {
  background: #eef1f5;
  color: #1f2937;
}

.actions .ghost:hover {
  background: #e2e6ec;
}

.actions .primary {
  background: #1f2937;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(31, 41, 55, 0.22);
}

.actions .primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(31, 41, 55, 0.28);
}

.content {
  max-width: 1120px;
  margin: 0 auto;
  padding: 26px 18px 40px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .topbar-inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .left-group {
    width: 100%;
    justify-content: space-between;
  }

  .actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
