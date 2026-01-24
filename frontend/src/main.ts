import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import App from './App.vue'

const app = createApp(App)
app.use(PrimeVue, {
    ripple: true,
    theme: {
        preset: Aura
    }
})
app.mount('#app')
