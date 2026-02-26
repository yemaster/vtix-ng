import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('vue-router') || id.includes('pinia') || id.includes('/vue/')) {
            return 'vue-vendor'
          }
        }
      }
    }
  }
})
