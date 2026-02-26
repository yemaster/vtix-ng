<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-left">Made by yemaster with ❤</div>
      <div class="footer-right">
        <RouterLink :to="{ name: 'about' }">关于</RouterLink>
        <span class="divider">·</span>
        <RouterLink :to="{ name: 'help' }">帮助</RouterLink>
        <span class="divider">·</span>
        <a href="https://qm.qq.com/q/PqwEed4eo8" target="_blank">交流QQ群</a>
        <span class="divider">·</span>
        <a href="https://github.com/yemaster/vtix-ng" target="_blank">Github</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: 1px solid var(--vtix-border);
  background: var(--vtix-surface);
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
  color: var(--vtix-text-muted);
  font-size: 13px;
}

.footer-left {
  color: var(--vtix-text-strong);
  font-weight: 500;
}

.footer-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.footer-right a {
  color: var(--vtix-text-muted);
  font-weight: 500;
  text-decoration: none;
}

.footer-right a:hover {
  color: var(--vtix-text-strong);
}

.divider {
  color: var(--vtix-border-strong);
}

@media (max-width: 768px) {
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
