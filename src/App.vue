<script setup>
import { RouterView } from 'vue-router'
import NotificationHost from './components/shared/NotificationHost.vue'
import ActivityToast from './components/shared/ActivityToast.vue'
import ActivityDrawer from './components/shared/ActivityDrawer.vue'
</script>

<template>
  <div class="h-[100dvh] bg-manuscript">
    <RouterView v-slot="{ Component, route }">
      <Transition name="route-fade" mode="out-in">
        <component :is="Component" :key="route.name" />
      </Transition>
    </RouterView>
    <NotificationHost />
    <ActivityToast />
    <ActivityDrawer />
  </div>
</template>

<style>
/* Route transition — subtle fade + lift. Spring-eased, reduced-motion aware. */
.route-fade-enter-active {
  transition:
    opacity 0.28s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.28s cubic-bezier(0.19, 1, 0.22, 1);
}
.route-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.route-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.route-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .route-fade-enter-active,
  .route-fade-leave-active {
    transition: opacity 0.12s linear;
  }
  .route-fade-enter-from,
  .route-fade-leave-to {
    transform: none;
  }
}
</style>
