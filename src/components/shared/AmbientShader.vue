<script setup>
import { Shader, Aurora } from 'shaders/vue'
</script>

<template>
  <div class="fixed inset-0 pointer-events-none z-0">
    <Shader class="w-full h-full">
      <Aurora
        color-a="#5c3a1e"
        color-b="#c9a96e"
        color-c="#8b6914"
        :intensity="35"
        :speed="3"
        :curtain-count="3"
        :waviness="30"
        :ray-density="15"
        :height="80"
        :center="{ x: 0.5, y: 0.2 }"
        :opacity="0.55"
      />
    </Shader>
  </div>
</template>
