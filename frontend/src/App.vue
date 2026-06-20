<script setup lang="ts">
import { RouterView } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
</script>

<template>
  <RouterView />
  <ConfirmDialog />
  <Toast position="top-right" />
</template>

<style scoped></style>
