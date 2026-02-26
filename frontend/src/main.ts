import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import App from './App.vue'
import Ripple from 'primevue/ripple'
import Tooltip from 'primevue/tooltip'
import router from './router'
import './style.css'
import './styles/primevue-overrides.css'
import './styles/transitions.css'
import './styles/panel-common.css'
import 'primeicons/primeicons.css'
import { useUserStore, type User } from './stores/user'
import { useThemeStore } from './stores/theme'

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const BACKEND_TIMEOUT_MS = 3500
type BackendStatus =
    | { ok: true; user: User | null }
    | { ok: false; user: null; message: string }

const skyPrimary = {
    50: '{sky.50}',
    100: '{sky.100}',
    200: '{sky.200}',
    300: '{sky.300}',
    400: '{sky.400}',
    500: '{sky.500}',
    600: '{sky.600}',
    700: '{sky.700}',
    800: '{sky.800}',
    900: '{sky.900}',
    950: '{sky.950}'
}

const SkyAura = {
    ...Aura,
    semantic: {
        ...Aura.semantic,
        primary: skyPrimary
    }
}

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(PrimeVue, {
    ripple: true,
    theme: {
        preset: SkyAura,
        options: {
            darkModeSelector: '[data-theme="dark"]'
        }
    }
})
app.use(ToastService)
app.directive('ripple', Ripple)
app.directive('tooltip', Tooltip)
app.use(router)

const themeStore = useThemeStore(pinia)
themeStore.init()

async function fetchCurrentUserWithTimeout(): Promise<BackendStatus> {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
    try {
        const response = await fetch(`${apiBase}/api/me`, {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
        })
        if (!response.ok) {
            if (response.status >= 500) {
                return {
                    ok: false,
                    user: null,
                    message: `后端服务异常（HTTP ${response.status}）`
                }
            }
            return { ok: true, user: null }
        }
        const data = (await response.json().catch(() => null)) as { user?: User | null } | null
        return { ok: true, user: data?.user ?? null }
    } catch (error) {
        const message = error instanceof Error ? error.message : '无法连接到后端服务'
        return { ok: false, user: null, message }
    } finally {
        window.clearTimeout(timeoutId)
    }
}

async function bootstrapApp() {
    const userStore = useUserStore(pinia)
    userStore.loading = true
    userStore.error = ''
    const backendStatus = await fetchCurrentUserWithTimeout()
    if (backendStatus.ok) {
        userStore.user = backendStatus.user
    } else {
        userStore.user = null
        userStore.error = backendStatus.message
        try {
            await router.replace({
                name: 'error',
                query: {
                    code: '503',
                    reason: '服务器连接失败',
                    message: `无法连接到后端服务（${apiBase}）。${backendStatus.message}`
                }
            })
        } catch {
            // ignore navigation errors
        }
    }
    userStore.loading = false
    app.mount('#app')
}

bootstrapApp()
