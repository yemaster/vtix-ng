<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'
import { useUserStore } from '../stores/user'
import AppFooter from '../components/AppFooter.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const userMenu = ref<InstanceType<typeof Menu> | null>(null)

const activeName = computed(() =>
  typeof route.name === 'string' ? route.name : String(route.name ?? '')
)

const isMobile = ref(false)
const isMobileMenuOpen = ref(false)
let mediaQuery: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null

const hideTopbar = computed(() => isMobile.value && route.name === 'test')

const MANAGE_QUESTION_BANK_ALL = 1 << 10
const MANAGE_USERS = 1 << 11

const mainNavItems = [
  { label: '题库', name: 'question-bank', icon: 'pi pi-book' },
  { label: '练习记录', name: 'records', icon: 'pi pi-clipboard' },
  { label: '错题', name: 'wrong-problems', icon: 'pi pi-exclamation-triangle' },
  { label: '帮助', name: 'help', icon: 'pi pi-question-circle' },
]

type DrawerMenuItem = MenuItem & { disabled?: boolean }

const userMenuItems = computed<DrawerMenuItem[]>(() => {
  const items = [
    {
      label: '个人空间',
      icon: 'pi pi-id-card',
      command: () =>
        router.push({
          name: 'user-space',
          params: { name: userStore.user?.name || 'guest' }
        })
    },
    {
      label: '编辑资料',
      icon: 'pi pi-user-edit',
      command: () =>
        router.push({
          name: 'user-edit',
          params: { name: userStore.user?.name || 'guest' }
        })
    },
    {
      label: '我的题库',
      icon: 'pi pi-folder-open',
      command: () => router.push({ name: 'admin-question-banks' })
    }
  ]

  const permissions = userStore.user?.permissions ?? 0
    const canManageAll = (permissions & MANAGE_QUESTION_BANK_ALL) === MANAGE_QUESTION_BANK_ALL
    const isAdmin = (permissions & MANAGE_USERS) === MANAGE_USERS
    if (isAdmin) {
      items.push({
        label: '管理后台',
        icon: 'pi pi-cog',
        command: () => router.push({ name: 'admin-home' })
      })
    } else if (canManageAll) {
      items.push({
        label: '题库管理',
        icon: 'pi pi-cog',
        command: () => router.push({ name: 'admin-question-banks' })
      })
    }

  items.push({
    label: '登出',
    icon: 'pi pi-sign-out',
    command: async () => {
      await userStore.logout()
      router.push({ name: 'home' })
    }
  })

  return items
})

function runMenuCommand(item: DrawerMenuItem, event: Event) {
  if (typeof item.command === 'function') {
    item.command({ originalEvent: event, item } as any)
  }
}

function toggleUserMenu(event: Event) {
  userMenu.value?.toggle(event)
}

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
    isMobileMenuOpen.value = false
  }
)
</script>

<template>
  <div class="app-shell">
    <header v-show="!hideTopbar" class="topbar">
      <div class="topbar-inner">
        <div class="left-group">
          <RouterLink class="brand brand-link" :to="{ name: 'home' }">
            <span class="brand-dot" />
            <span class="brand-word">VTIX</span>
          </RouterLink>
          <nav v-if="!isMobile" class="nav">
            <RouterLink
              v-for="item in mainNavItems"
              :key="item.name"
              :to="{ name: item.name }"
              :class="['nav-link', { active: activeName === item.name }]"
              v-ripple
            >
              <span class="nav-icon" :class="item.icon" aria-hidden="true" />
              <span class="nav-text">{{ item.label }}</span>
            </RouterLink>
          </nav>
        </div>
        <div v-if="!isMobile" class="actions">
          <template v-if="!userStore.user">
            <Button label="登录" severity="secondary" text size="small" class="action-btn ghost"
              @click="router.push({ name: 'login' })" />
            <Button label="开始使用" size="small" class="action-btn primary"
              @click="router.push({ name: 'register' })" />
          </template>
          <template v-else>
            <div class="user-area">
              <button type="button" class="user-trigger" @click="toggleUserMenu">
                <span class="user-name">{{ userStore.user.name || '用户' }}</span>
                <span class="caret">▾</span>
              </button>
              <span class="group-badge">{{ userStore.user.groupName || '用户组' }}</span>
              <Menu ref="userMenu" size="big" :model="userMenuItems" popup />
            </div>
          </template>
        </div>
        <Button v-if="isMobile" type="button" severity="secondary" text icon="pi pi-bars" class="menu-toggle"
          :aria-expanded="isMobileMenuOpen" aria-controls="mobile-drawer" aria-label="展开菜单"
          @click="isMobileMenuOpen = !isMobileMenuOpen" />
      </div>
    </header>

    <transition name="backdrop-fade">
      <div v-if="isMobile && isMobileMenuOpen" class="mobile-backdrop" @click="isMobileMenuOpen = false" />
    </transition>
    <aside v-if="isMobile" id="mobile-drawer" :class="['mobile-drawer', { open: isMobileMenuOpen }]">
      <div class="drawer-head">
        <RouterLink class="brand mini brand-link" :to="{ name: 'home' }">
          <span class="brand-dot" />
          <span class="brand-word">VTIX</span>
        </RouterLink>
        <Button type="button" severity="secondary" text icon="pi pi-times" class="drawer-close" aria-label="关闭菜单"
          @click="isMobileMenuOpen = false" />
      </div>
      <nav class="drawer-nav">
        <RouterLink
          v-for="item in mainNavItems"
          :key="item.name"
          :to="{ name: item.name }"
          :class="['drawer-link', { active: activeName === item.name }]"
          v-ripple
        >
          <span class="nav-icon" :class="item.icon" aria-hidden="true" />
          <span class="nav-text">{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="drawer-actions">
        <template v-if="!userStore.user">
          <Button label="登录" severity="secondary" text size="small" class="action-btn ghost"
            @click="router.push({ name: 'login' })" />
          <Button label="开始使用" size="small" class="action-btn primary"
            @click="router.push({ name: 'register' })" />
        </template>
        <template v-else>
          <div class="drawer-user">
            <div class="drawer-user-row">
              <div class="drawer-user-name">{{ userStore.user.name || '用户' }}</div>
              <span class="group-badge">{{ userStore.user.groupName || '用户组' }}</span>
            </div>
            <div class="drawer-user-email">{{ userStore.user.email || '未填写邮箱' }}</div>
          </div>
          <div class="drawer-menu">
            <button
              v-for="item in userMenuItems"
              :key="String(item.label ?? '')"
              type="button"
              :disabled="item.disabled"
              :class="['drawer-menu-item', { disabled: item.disabled }]"
              @click="runMenuCommand(item, $event)"
            >
              <span class="nav-icon" :class="item.icon" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </template>
      </div>
    </aside>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
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

.brand-word {
  font-size: 16px;
}

.topbar .brand-dot,
.drawer-head .brand-dot {
  display: none;
}

.brand-link {
  text-decoration: none;
  color: inherit;
}

.nav {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.nav-link {
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  overflow: hidden;
}

.nav-link .nav-icon {
  font-size: 14px;
  color: #64748b;
}

.nav-link:hover {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #0f172a;
}

.nav-link.active {
  background: var(--vtix-primary-100);
  color: #0f172a;
  border-color: var(--vtix-primary-100);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.nav-link.active .nav-icon {
  color: #0f172a;
}

.actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-area {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-trigger {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.3s ease, color 0.3s ease;
}

.user-trigger:hover {
  background: #f1f3f6;
  color: #111827;
}

.user-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 12px;
  color: #64748b;
}

.group-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #e2e8f0;
  color: #0f172a;
}

.drawer-user {
  padding: 8px 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.drawer-user-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.drawer-user-name {
  font-weight: 700;
  color: #0f172a;
}

.drawer-user-email {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.drawer-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-menu-item {
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: #0f172a;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.drawer-menu-item:hover {
  background: #f1f5f9;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.drawer-menu-item.disabled {
  cursor: not-allowed;
  color: #94a3b8;
  background: transparent;
  border-color: transparent;
}

.content {
  max-width: 1120px;
  margin: 0 auto;
  padding: 26px 18px 40px;
  flex: 1 0 auto;
  width: 100%;
}


@media (max-width: 768px) {
  .topbar-inner {
    flex-direction: row;
    align-items: center;
    padding: 12px 14px;
    gap: 10px;
  }

  .left-group {
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .brand {
    justify-content: flex-start;
  }

  .nav,
  .actions {
    display: none;
  }

}

.mobile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
  z-index: 20;
}

.mobile-drawer {
  position: fixed;
  top: 0;
  left: 0;
  right: auto;
  height: 100vh;
  width: min(78vw, 320px);
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  box-shadow: 12px 0 30px rgba(15, 23, 42, 0.12);
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.3s ease, opacity 0.3s ease;
  z-index: 21;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 18px 24px;
}

.mobile-drawer.open {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand.mini .brand-word {
  font-size: 14px;
}

.drawer-close {
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

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-link {
  text-decoration: none;
  color: #0f172a;
  font-weight: 500;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.drawer-link.active,
.drawer-link:hover {
  background: var(--vtix-primary-100);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.nav-text {
  white-space: nowrap;
}


.drawer-actions {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
</style>
