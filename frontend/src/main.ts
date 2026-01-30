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

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(PrimeVue, {
    ripple: true,
    theme: {
        preset: Aura
    }
})
app.use(ToastService)
app.directive('ripple', Ripple)
app.directive('tooltip', Tooltip)
app.use(router)

const userStore = useUserStore(pinia)
userStore.loadCurrentUser().finally(() => {
    app.mount('#app')
})
