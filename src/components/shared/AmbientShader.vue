<script setup>
import { Shader, FlowingGradient, Vignette } from 'shaders/vue'
</script>

<template>
  <div class="fixed inset-0 pointer-events-none z-0">
    <Shader class="w-full h-full">
      <FlowingGradient
        color-a="#0a0806"
        color-b="#1a1510"
        color-c="#2a2018"
        color-d="#1a1410"
        :speed="0.2"
        :distortion="0.15"
        :opacity="0.5"
      />
      <Vignette
        color="#000000"
        :radius="0.4"
        :falloff="0.6"
        :intensity="0.4"
      />
    </Shader>
  </div>
</template>
