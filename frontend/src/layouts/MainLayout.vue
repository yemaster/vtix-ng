<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Popover from 'primevue/popover'
import SelectButton from 'primevue/selectbutton'
import type { MenuItem } from 'primevue/menuitem'
import { useUserStore } from '../stores/user'
import { useThemeStore, type ThemeMode, type ThemeStyle } from '../stores/theme'
import AppFooter from '../components/AppFooter.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()
const userMenu = ref<InstanceType<typeof Menu> | null>(null)
const moreMenu = ref<InstanceType<typeof Menu> | null>(null)
const themePanel = ref<InstanceType<typeof Popover> | null>(null)
const unreadCount = ref(0)

const activeName = computed(() =>
  typeof route.name === 'string' ? route.name : String(route.name ?? '')
)

const isMobile = ref(false)
const isMobileMenuOpen = ref(false)
let mediaQuery: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null

const hideTopbar = computed(() => isMobile.value && route.name === 'test')

const themeOptions: Array<{ value: ThemeMode; icon: string; label: string }> = [
  { value: 'system', icon: 'pi pi-desktop', label: '跟随系统' },
  { value: 'light', icon: 'pi pi-sun', label: 'Light' },
  { value: 'dark', icon: 'pi pi-moon', label: 'Dark' }
]
const themeStyleOptions: Array<{ value: ThemeStyle; label: string }> = [
  { value: 'card', label: '卡片' },
  { value: 'paper', label: '纸张' }
]
const themeMode = computed({
  get: () => themeStore.mode,
  set: (value) => {
    if (value) {
      setThemeMode(value)
    }
  }
})
const themeStyle = computed({
  get: () => themeStore.style,
  set: (value) => {
    if (value) {
      setThemeStyle(value)
    }
  }
})

const MANAGE_QUESTION_BANK_ALL = 1 << 10
const MANAGE_USERS = 1 << 11

const mainNavItems = [
  { label: '题库', name: 'question-bank', icon: 'pi pi-book' },
  { label: '练习记录', name: 'records', icon: 'pi pi-clipboard' },
  { label: '错题', name: 'wrong-problems', icon: 'pi pi-exclamation-triangle' },
  { label: '帮助', name: 'help', icon: 'pi pi-question-circle' },
]

type DrawerMenuItem = MenuItem & { disabled?: boolean; badge?: string; badgeClass?: string }

const moreNavItems = [
  { label: '题库广场', name: 'question-bank-plaza', icon: 'pi pi-th-large' }
]

const isMoreActive = computed(() =>
  moreNavItems.some((item) => item.name === activeName.value)
)

const moreMenuItems = computed<MenuItem[]>(() =>
  moreNavItems.map((item) => ({
    label: item.label,
    icon: item.icon,
    command: () => router.push({ name: item.name })
  }))
)

const userMenuItems = computed<DrawerMenuItem[]>(() => {
  const unreadLabel = unreadCount.value > 0 ? String(unreadCount.value) : undefined
  const items = [
    {
      label: '我的消息',
      icon: 'pi pi-bell',
      badge: unreadLabel,
      badgeClass: unreadLabel ? 'unread-badge' : undefined,
      command: () => router.push({ name: 'messages' })
    },
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

async function loadUnreadCount() {
  if (!userStore.user) {
    unreadCount.value = 0
    return
  }
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'}/api/messages/unread-count`, {
      credentials: 'include'
    })
    if (!response.ok) return
    const data = (await response.json().catch(() => null)) as { count?: number } | null
    const count = Number(data?.count ?? 0)
    unreadCount.value = Number.isFinite(count) ? count : 0
  } catch {
    unreadCount.value = 0
  }
}

function runMenuCommand(item: DrawerMenuItem, event: Event) {
  if (typeof item.command === 'function') {
    item.command({ originalEvent: event, item } as any)
  }
}

function toggleUserMenu(event: Event) {
  userMenu.value?.toggle(event)
}

function toggleMoreMenu(event: Event) {
  moreMenu.value?.toggle(event)
}

function toggleThemePanel(event: Event) {
  themePanel.value?.toggle(event)
}

function hideThemePanel() {
  themePanel.value?.hide()
}

function setThemeMode(mode: ThemeMode) {
  themeStore.setMode(mode)
}

function setThemeStyle(style: ThemeStyle) {
  themeStore.setStyle(style)
}

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 900px)')
  mediaHandler = () => {
    if (mediaQuery) {
      isMobile.value = mediaQuery.matches
    }
  }
  mediaHandler()
  void loadUnreadCount()
  window.addEventListener('messages-updated', loadUnreadCount)
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', mediaHandler)
  } else {
    mediaQuery.addListener(mediaHandler)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('messages-updated', loadUnreadCount)
  if (mediaQuery && mediaHandler) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaHandler)
    } else {
      mediaQuery.removeListener(mediaHandler)
    }
  }
})

watch(
  () => userStore.user,
  () => {
    void loadUnreadCount()
  }
)

watch(
  () => route.fullPath,
  () => {
    isMobileMenuOpen.value = false
    hideThemePanel()
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
            <Button
              type="button"
              text
              icon="pi pi-ellipsis-h"
              label="更多"
              class="nav-more-trigger"
              :class="{ active: isMoreActive }"
              @click="toggleMoreMenu"
            />
            <Menu ref="moreMenu" size="big" :model="moreMenuItems" popup />
          </nav>
        </div>
        <div v-if="!isMobile" class="actions">
          <div class="theme-switch">
            <Button
              type="button"
              severity="secondary"
              text
              icon="pi pi-palette"
              class="theme-toggle"
              aria-label="打开主题面板"
              @click="toggleThemePanel"
            />
          </div>
          <template v-if="!userStore.user">
            <Button label="登录" severity="secondary" text size="small" class="action-btn ghost"
              @click="router.push({ name: 'login' })" />
            <Button label="注册账号" size="small" class="action-btn primary"
              @click="router.push({ name: 'register' })" />
          </template>
          <template v-else>
            <div class="user-area">
              <button type="button" class="user-trigger" @click="toggleUserMenu">
                <span class="user-name">{{ userStore.user.name || '用户' }}</span>
                <span class="caret">▾</span>
              </button>
              <span class="group-badge">{{ userStore.user.groupName || '用户组' }}</span>
              <Menu ref="userMenu" size="big" :model="userMenuItems" popup>
                <template #item="{ item, props }">
                  <a v-ripple v-bind="props.action">
                    <span class="nav-icon" :class="item.icon" aria-hidden="true" />
                    <span class="menu-item-label">{{ item.label }}</span>
                    <span v-if="item.badge" class="menu-badge">{{ item.badge }}</span>
                  </a>
                </template>
              </Menu>
            </div>
          </template>
        </div>
        <div v-if="isMobile" class="mobile-actions">
          <div class="theme-switch">
            <Button
              type="button"
              severity="secondary"
              text
              icon="pi pi-palette"
              class="theme-toggle"
              aria-label="打开主题面板"
              @click="toggleThemePanel"
            />
          </div>
          <Button type="button" severity="secondary" text icon="pi pi-bars" class="menu-toggle"
            :aria-expanded="isMobileMenuOpen" aria-controls="mobile-drawer" aria-label="展开菜单"
            @click="isMobileMenuOpen = !isMobileMenuOpen" />
        </div>
      </div>
    </header>

    <Popover
      ref="themePanel"
      class="theme-panel"
      appendTo="body"
      :pt="{ transition: { name: 'theme-panel', css: true } }"
    >
      <div class="theme-panel-head">
        <div class="theme-panel-title">主题模式</div>
        <Button
          type="button"
          severity="secondary"
          text
          icon="pi pi-times"
          class="theme-panel-close"
          aria-label="关闭主题面板"
          @click="hideThemePanel"
        />
      </div>
      <SelectButton
        v-model="themeMode"
        :options="themeOptions"
        optionLabel="label"
        optionValue="value"
        class="theme-options"
        aria-label="主题模式选择"
      >
        <template #option="{ option }">
          <span :class="['theme-option-icon', option.icon]" aria-hidden="true" />
          <span class="sr-only">{{ option.label }}</span>
        </template>
      </SelectButton>
      <div class="theme-panel-title">主题风格</div>
      <SelectButton
        v-model="themeStyle"
        :options="themeStyleOptions"
        optionLabel="label"
        optionValue="value"
        class="theme-style"
        aria-label="主题风格选择"
        size="small"
      />
    </Popover>

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
        <div class="drawer-section-title">更多</div>
        <RouterLink
          v-for="item in moreNavItems"
          :key="item.name"
          :to="{ name: item.name }"
          :class="['drawer-link', { active: activeName === item.name }]"
          v-ripple
          @click="isMobileMenuOpen = false"
        >
          <span class="nav-icon" :class="item.icon" aria-hidden="true" />
          <span class="nav-text">{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="drawer-actions">
        <template v-if="!userStore.user">
          <Button label="登录" severity="secondary" size="small" class="action-btn ghost"
            @click="router.push({ name: 'login' })" />
          <Button label="注册账号" size="small" class="action-btn primary"
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
              <span v-if="item.badge" class="menu-badge">{{ item.badge }}</span>
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
  background: var(--vtix-topbar-bg);
  border-bottom: 1px solid var(--vtix-border);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px var(--vtix-shadow);
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
  color: var(--vtix-text-strong);
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

.nav-more-trigger.p-button {
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vtix-text-strong);
  font-weight: 600;
  padding: 8px 12px;
  gap: 8px;
}

.nav-more-trigger.p-button:hover {
  background: var(--vtix-surface-2);
  border-color: var(--vtix-border-strong);
  color: var(--vtix-text-strong);
}

.nav-more-trigger.p-button.active {
  background: var(--vtix-active-bg);
  color: var(--vtix-active-text);
  border-color: var(--vtix-active-border);
  box-shadow: 0 6px 14px var(--vtix-shadow);
}

.nav-more-trigger.p-button :deep(.p-button-icon) {
  font-size: 14px;
  color: var(--vtix-text-muted);
}

.nav-link .nav-icon {
  font-size: 14px;
  color: var(--vtix-text-muted);
}

.nav-link:hover {
  background: var(--vtix-surface-2);
  border-color: var(--vtix-border-strong);
  color: var(--vtix-text-strong);
}

.nav-link.active {
  background: var(--vtix-active-bg);
  color: var(--vtix-active-text);
  border-color: var(--vtix-active-border);
  box-shadow: 0 6px 14px var(--vtix-shadow);
}

.nav-link.active .nav-icon {
  color: var(--vtix-active-text);
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
  color: var(--vtix-text-strong);
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
  background: var(--vtix-surface-5);
  color: var(--vtix-text);
}

.user-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 12px;
  color: var(--vtix-text-muted);
}

.group-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--vtix-border-strong);
  color: var(--vtix-text-strong);
}

.drawer-user {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border-strong);
}

.drawer-user-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.drawer-user-name {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.drawer-user-email {
  font-size: 12px;
  color: var(--vtix-text-muted);
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
  color: var(--vtix-text-strong);
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.menu-badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--vtix-danger-solid);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

:deep(.p-menuitem-link) {
  display: flex;
  align-items: center;
  gap: 10px;
}

.menu-item-label {
  flex: 1;
}

:deep(.unread-badge) {
  background: var(--vtix-danger-solid);
  color: #fff;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  font-size: 11px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.drawer-menu-item:hover {
  background: var(--vtix-surface-3);
  box-shadow: 0 6px 14px var(--vtix-shadow);
}

.drawer-menu-item.disabled {
  cursor: not-allowed;
  color: var(--vtix-text-subtle);
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
  background: var(--vtix-backdrop);
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
  background: var(--vtix-surface);
  border-right: 1px solid var(--vtix-border);
  box-shadow: 12px 0 30px var(--vtix-shadow-strong);
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
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface-2);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--vtix-text-strong);
}

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-link {
  text-decoration: none;
  color: var(--vtix-text-strong);
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

.drawer-section-title {
  margin: 6px 0 2px;
  padding: 0 4px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vtix-text-subtle);
}

.drawer-link.active,
.drawer-link:hover {
  background: var(--vtix-active-bg);
  box-shadow: 0 6px 14px var(--vtix-shadow);
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

.theme-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.theme-toggle {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
}

.theme-toggle:hover {
  background: var(--vtix-surface-3);
}

.mobile-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.theme-panel-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--vtix-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.theme-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.theme-panel-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--vtix-border);
  background: var(--vtix-surface-2);
  color: var(--vtix-text-strong);
}

.theme-panel-close:hover {
  background: var(--vtix-surface-3);
}

.theme-option-icon {
  font-size: 16px;
}
</style>
