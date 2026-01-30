<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import Button from 'primevue/button'
import { useUserStore } from '../stores/user'

const route = useRoute()
const userStore = useUserStore()

const activeName = computed(() =>
  typeof route.name === 'string' ? route.name : String(route.name ?? '')
)

const isMobile = ref(false)
const isDrawerOpen = ref(false)
let mediaQuery: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null

const MANAGE_QUESTION_BANK_OWN = 1 << 9
const MANAGE_QUESTION_BANK_ALL = 1 << 10
const MANAGE_USERS = 1 << 11

const canManageQuestionBanks = computed(() => {
  const permissions = userStore.user?.permissions ?? 0
  return (
    (permissions & MANAGE_QUESTION_BANK_ALL) === MANAGE_QUESTION_BANK_ALL ||
    (permissions & MANAGE_QUESTION_BANK_OWN) === MANAGE_QUESTION_BANK_OWN ||
    (permissions & MANAGE_USERS) === MANAGE_USERS
  )
})

const canManageUsers = computed(() => {
  const permissions = userStore.user?.permissions ?? 0
  return (permissions & MANAGE_USERS) === MANAGE_USERS
})

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 900px)')
  mediaHandler = () => {
    if (mediaQuery) {
      isMobile.value = mediaQuery.matches
    }
  }
  mediaHandler()
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', mediaHandler)
  } else {
    mediaQuery.addListener(mediaHandler)
  }
})

onBeforeUnmount(() => {
  if (mediaQuery && mediaHandler) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaHandler)
    } else {
      mediaQuery.removeListener(mediaHandler)
    }
  }
})

watch(
  () => route.fullPath,
  () => {
    isDrawerOpen.value = false
  }
)
</script>

<template>
  <div class="admin-shell">
    <aside :class="['sidebar', { open: isDrawerOpen }]">
      <div class="sidebar-head">
        <div class="brand">
          <span class="brand-dot" />
          <span class="brand-word">VTIX 管理台</span>
        </div>
        <Button v-if="isMobile" severity="secondary" text icon="pi pi-times" class="sidebar-close" type="button"
          @click="isDrawerOpen = false" />
      </div>

      <nav class="nav-groups">
        <div class="nav-group">
          <div class="nav-title">统计相关</div>
          <div class="nav-links">
            <RouterLink :to="{ name: 'admin-home' }" :class="['nav-link', { active: activeName === 'admin-home' }]">
              <span class="nav-icon pi pi-chart-bar" aria-hidden="true" />
              <span>数据概览</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'admin-trends' }"
              :class="['nav-link', { active: activeName === 'admin-trends' }]"
            >
              <span class="nav-icon pi pi-chart-line" aria-hidden="true" />
              <span>趋势分析</span>
            </RouterLink>
          </div>
        </div>

        <div v-if="canManageQuestionBanks" class="nav-group">
          <div class="nav-title">题库管理</div>
          <div class="nav-links">
            <RouterLink
              :to="{ name: 'admin-question-bank-create' }"
              :class="['nav-link', { active: activeName === 'admin-question-bank-create' }]"
            >
              <span class="nav-icon pi pi-plus-circle" aria-hidden="true" />
              <span>题库创建</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'admin-question-banks' }"
              :class="['nav-link', { active: activeName === 'admin-question-banks' }]"
            >
              <span class="nav-icon pi pi-folder-open" aria-hidden="true" />
              <span>题库管理</span>
            </RouterLink>
          </div>
        </div>

        <div v-if="canManageUsers" class="nav-group">
          <div class="nav-title">用户相关</div>
          <div class="nav-links">
            <RouterLink
              :to="{ name: 'admin-user-groups' }"
              :class="['nav-link', { active: activeName === 'admin-user-groups' }]"
            >
              <span class="nav-icon pi pi-users" aria-hidden="true" />
              <span>用户组管理</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'admin-users' }"
              :class="['nav-link', { active: activeName === 'admin-users' }]"
            >
              <span class="nav-icon pi pi-user" aria-hidden="true" />
              <span>用户管理</span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="nav-title">返回前台</div>
        <div class="nav-links">
          <RouterLink class="nav-link" :to="{ name: 'home' }">
            <span class="nav-icon pi pi-home" aria-hidden="true" />
            <span>前台首页</span>
          </RouterLink>
          <RouterLink class="nav-link" :to="{ name: 'question-bank' }">
            <span class="nav-icon pi pi-book" aria-hidden="true" />
            <span>题库首页</span>
          </RouterLink>
        </div>
      </div>
    </aside>

    <div v-if="isMobile && isDrawerOpen" class="drawer-backdrop" @click="isDrawerOpen = false" />

    <div class="admin-main">
      <header class="admin-topbar">
        <div class="brand small">
          <span class="brand-dot" />
          <span class="brand-word">VTIX 管理台</span>
        </div>
        <Button class="menu-toggle" severity="secondary" text icon="pi pi-bars" type="button"
          @click="isDrawerOpen = !isDrawerOpen" />
      </header>
      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  height: 100vh;
  display: flex;
  background: #f2f4f7;
}

.sidebar {
  width: 260px;
  height: 100vh;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 18px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-word {
  font-size: 13px;
}

.nav-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
  font-weight: 700;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  color: #0f172a;
  font-weight: 500;
  font-size: 14px;
  border: 1px solid transparent;
  background: transparent;
  transition: background 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  text-decoration: none;
}

.nav-link span+span {
  margin-left: 10px;
  flex: 1;
  text-align: left;
}

.nav-link:hover,
.nav-link.active {
  background: #f1f5f9;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}


.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.admin-content {
  padding: 24px 26px 40px;
  flex: 1;
  overflow: auto;
}

.admin-topbar {
  display: none;
}

.sidebar-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #0f172a;
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 20;
}

@media (max-width: 900px) {
  .admin-shell {
    flex-direction: column;
    height: 100vh;
  }

  .admin-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid #e5e7eb;
    backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 15;
  }

  .brand.small .brand-word {
    font-size: 12px;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 30;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 12px 0 30px rgba(15, 23, 42, 0.12);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .admin-content {
    padding: 20px 16px 32px;
  }
}
</style>
