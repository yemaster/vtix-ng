<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-left">Made by yemaster with ❤</div>
      <div class="footer-right">
        <a href="https://github.com/yemaster/vtix-ng" target="_blank">Github</a>
        <span class="divider">·</span>
        <RouterLink :to="{ name: 'about' }">关于</RouterLink>
        <span class="divider">·</span>
        <RouterLink :to="{ name: 'help' }">帮助</RouterLink>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
  margin-top: auto;
}

.footer-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #6b7280;
  font-size: 13px;
}

.footer-left {
  color: #0f172a;
  font-weight: 600;
}

.footer-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.footer-right a {
  color: #4b5563;
  font-weight: 600;
  text-decoration: none;
}

.footer-right a:hover {
  color: #0f172a;
}

.divider {
  color: #cbd5f5;
}

@media (max-width: 768px) {
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
