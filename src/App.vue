<script setup>
import { RouterView } from 'vue-router'
import NotificationHost from './components/shared/NotificationHost.vue'
import ActivityToast from './components/shared/ActivityToast.vue'
import ActivityDrawer from './components/shared/ActivityDrawer.vue'
</script>

<template>
  <div class="h-[100dvh] bg-manuscript">
    <!--
      No route-level <Transition>, deliberately.

      This used to be `<Transition name="route-fade" mode="out-in">`. `out-in`
      holds the incoming view back until the outgoing view's CSS transition
      finishes, which makes *navigating at all* conditional on a transition
      completing. When one wedged — the outgoing view kept both
      `route-fade-enter-from` and `route-fade-leave-active`, stuck at opacity 0 —
      the next screen never mounted: the URL changed, the old page stayed, and
      only a manual refresh recovered. A 280ms cross-fade between full app
      screens is not worth making navigation depend on CSS.

      Keyed by path so `/editor/1` → `/editor/2` remounts. Both share the route
      name `editor`, and EditorView reads `route.params.projectId` only in
      `onMounted`, so a name key left the manuscript on the previous project.
      Path rather than fullPath, so a future query param does not discard a
      loaded manuscript just to change a filter.
    -->
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.path" />
    </RouterView>
    <NotificationHost />
    <ActivityToast />
    <ActivityDrawer />
  </div>
</template>
