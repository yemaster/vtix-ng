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
import { useUserStore } from './stores/user'
import { useThemeStore } from './stores/theme'

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'
const BACKEND_TIMEOUT_MS = 3500

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

async function checkBackendAvailability() {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
    try {
        await fetch(`${apiBase}/api/me`, {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
        })
        return { ok: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : '无法连接到后端服务'
        return { ok: false, message }
    } finally {
        window.clearTimeout(timeoutId)
    }
}

async function bootstrapApp() {
    const backendStatus = await checkBackendAvailability()
    const userStore = useUserStore(pinia)
    if (backendStatus.ok) {
        await userStore.loadCurrentUser()
    } else {
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
            // ignore navigation errors and still mount the app
        }
    }
    app.mount('#app')
}

bootstrapApp()
