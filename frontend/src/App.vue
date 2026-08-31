<script setup lang="ts">
import { RouterView } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'

// ConfirmDialog's slot props are loosely typed; derive tone/icon from the
// (typed) acceptProps.severity here so the template stays clean.
function confirmTone(message: any): string {
  return message?.acceptProps?.severity === 'danger' ? 'tone-danger' : 'tone-info'
}
function confirmIcon(message: any): string {
  return message?.acceptProps?.severity === 'danger'
    ? 'pi pi-trash'
    : 'pi pi-info-circle'
}
</script>

<template>
  <RouterView />
  <ConfirmDialog
    :style="{ width: '420px' }"
    :breakpoints="{ '640px': '92vw' }"
    :modal="true"
  >
    <template #message="slotProps">
      <div class="vtix-confirm-body">
        <span :class="['vtix-confirm-icon', confirmTone(slotProps.message)]">
          <i :class="confirmIcon(slotProps.message)" />
        </span>
        <span class="vtix-confirm-text">{{ slotProps.message?.message }}</span>
      </div>
    </template>
  </ConfirmDialog>
  <Toast position="top-right" />
</template>

<!-- Global (ConfirmDialog teleports to body, so these must be unscoped). -->
<style>
.vtix-confirm-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.vtix-confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 18px;
}

.vtix-confirm-icon.tone-danger {
  background: var(--vtix-danger-bg);
  color: var(--vtix-danger-text);
  border: 1px solid var(--vtix-danger-border);
}

.vtix-confirm-icon.tone-info {
  background: var(--vtix-surface-2);
  color: var(--vtix-primary-600);
  border: 1px solid var(--vtix-border-strong);
}

.vtix-confirm-text {
  flex: 1;
  min-width: 0;
  color: var(--vtix-text);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-line;
  word-break: break-word;
}
</style>
