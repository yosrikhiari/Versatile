<script setup>
const props = defineProps({
  blueprint: Object
})

const emit = defineEmits(['insert'])

function formatForWriting() {
  const b = props.blueprint
  const text = `CHAPTER: ${b.title}

OPENING:
${b.openingBeat}

TURNING POINT:
${b.turningPoint}

CONFRONTATION:
${b.confrontationBeat}

CLOSING:
${b.closingBeat}

---
SENSORY: ${b.sensoryAnchor}
DIALOGUE HOOK: ${b.dialogueHook}
NOTES: ${b.writingNotes}`
  
  emit('insert', text)
}
</script>

<template>
  <div class="rounded-lg p-4 space-y-4 bg-bg-tertiary border border-border-subtle">
    <div class="flex justify-between items-start">
      <h3 class="font-semibold text-text-primary font-body">{{ blueprint.title }}</h3>
      <button
        class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="formatForWriting"
      >
        Insert as Draft
      </button>
    </div>
    
    <div class="space-y-3 text-sm">
      <div class="flex gap-2">
        <span class="text-text-hint font-ui text-xs uppercase tracking-wider shrink-0 w-24">Opening</span>
        <span class="text-text-secondary font-body">{{ blueprint.openingBeat }}</span>
      </div>
      <div class="flex gap-2">
        <span class="text-text-hint font-ui text-xs uppercase tracking-wider shrink-0 w-24">Turning Pt</span>
        <span class="text-text-secondary font-body">{{ blueprint.turningPoint }}</span>
      </div>
      <div class="flex gap-2">
        <span class="text-text-hint font-ui text-xs uppercase tracking-wider shrink-0 w-24">Confront</span>
        <span class="text-text-secondary font-body">{{ blueprint.confrontationBeat }}</span>
      </div>
      <div class="flex gap-2">
        <span class="text-text-hint font-ui text-xs uppercase tracking-wider shrink-0 w-24">Closing</span>
        <span class="text-text-secondary font-body">{{ blueprint.closingBeat }}</span>
      </div>
    </div>

    <div class="bg-accent-muted/20 border-l-2 border-accent-muted rounded-r-md p-3 space-y-3">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-text-hint font-ui mb-1">Sensory Anchor</div>
        <p class="text-sm text-text-secondary italic font-body">{{ blueprint.sensoryAnchor }}</p>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-text-hint font-ui mb-1">Dialogue Hook</div>
        <p class="text-sm text-text-secondary italic font-body">{{ blueprint.dialogueHook }}</p>
      </div>
    </div>

    <div v-if="blueprint.writingNotes" class="text-xs italic text-text-hint font-body border-l-2 border-accent-muted pl-3">
      {{ blueprint.writingNotes }}
    </div>
  </div>
</template>
