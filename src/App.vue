<script setup>
import { RouterView } from 'vue-router'
import NotificationHost from './components/shared/NotificationHost.vue'
import ActivityToast from './components/shared/ActivityToast.vue'
import ActivityDrawer from './components/shared/ActivityDrawer.vue'
</script>

<template>
  <div class="h-screen bg-manuscript ambient-glow grain">
    <RouterView />
    <NotificationHost />
    <ActivityToast />
    <ActivityDrawer />
  </div>
</template>
