<script setup>
import { ref, computed } from 'vue'
import { useStoryQueryStore } from '../../stores/useStoryQueryStore'
import { FILTER_OPS, NONE_GROUP, ROW_CAP } from '../../services/storyQuery'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseChip from '../ui/BaseChip.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * Story Query — the one cross-entity / scene-level query surface (Bases /
 * Dataview analog). Pick a dataset, stack filters, sort, group, edit a cell in
 * place. It renders the rows the story-bible and manuscript stores already
 * hold and writes back through their updaters; it is not a third copy.
 */
const store = useStoryQueryStore()

const DATASETS = [
  { value: 'subsections', label: 'Scenes' },
  { value: 'sections', label: 'Chapters' },
  { value: 'characters', label: 'Characters' },
  { value: 'locations', label: 'Locations' },
  { value: 'plotThreads', label: 'Threads' }
]

const COMBINATORS = [
  { value: 'and', label: 'All' },
  { value: 'or', label: 'Any' }
]

const editing = ref(null) // { rowId, field }
const draft = ref('')

const fieldByKey = computed(() => new Map(store.fields.map((f) => [f.key, f])))

function opNeedsValue(op) {
  return FILTER_OPS.find((o) => o.op === op)?.needsValue ?? true
}

function display(row, field) {
  const v = field.key.startsWith('metadata.')
    ? row.metadata?.[field.key.slice('metadata.'.length)]
    : row[field.key]
  if (v === undefined || v === null || v === '') return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}

function startEdit(row, field) {
  if (!field.editable) return
  editing.value = { rowId: row.id, field: field.key }
  draft.value = display(row, field)
}

function isEditing(row, field) {
  return editing.value?.rowId === row.id && editing.value?.field === field.key
}

async function commitEdit(row, field) {
  if (!isEditing(row, field)) return
  const raw = draft.value
  let value = raw
  if (field.type === 'number') value = raw === '' ? null : Number(raw)
  else if (field.type === 'boolean') value = /^(y|yes|true|1)$/i.test(raw.trim())
  else if (field.type === 'list')
    value = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  editing.value = null
  await store.updateCell(row.id, field.key, value)
}

function cancelEdit() {
  editing.value = null
}

function toggleSort(field) {
  const cur = store.query.sort
  if (cur?.field === field.key) {
    if (cur.dir === 'asc') store.setSort(field.key, 'desc')
    else store.setSort(null)
  } else {
    store.setSort(field.key, 'asc')
  }
}

const groupEntries = computed(() => (store.results.groups ? [...store.results.groups] : null))
</script>

<template>
  <div class="space-y-0" data-test="story-query">
    <BaseSection first title="Ask the story" description="One question, answered in a click.">
      <div class="flex flex-wrap gap-1.5">
        <BaseChip
          v-for="p in store.presets"
          :key="p.id"
          variant="filter"
          :active="store.activePreset === p.id"
          :title="p.description"
          :data-test="`preset-${p.id}`"
          @click="store.applyPreset(p.id)"
        >
          {{ p.label }}
        </BaseChip>
      </div>
    </BaseSection>

    <BaseSection
      title="Query"
      :meta="`${store.results.total} row${store.results.total === 1 ? '' : 's'}`"
    >
      <div class="space-y-3">
        <BaseSegmented
          :model-value="store.query.dataset"
          :options="DATASETS"
          size="sm"
          block
          aria-label="Dataset"
          @update:model-value="store.setDataset($event)"
        />

        <div v-if="store.query.filters.length" class="space-y-2">
          <div
            v-for="(f, i) in store.query.filters"
            :key="i"
            class="flex flex-wrap items-center gap-1.5"
            data-test="filter-row"
          >
            <select
              :value="f.field"
              class="bg-bg-secondary text-text-primary text-xs font-ui rounded px-2 py-1"
              aria-label="Field"
              @change="store.updateFilter(i, { field: $event.target.value })"
            >
              <option v-for="fd in store.fields" :key="fd.key" :value="fd.key">
                {{ fd.label }}
              </option>
            </select>
            <select
              :value="f.op"
              class="bg-bg-secondary text-text-primary text-xs font-ui rounded px-2 py-1"
              aria-label="Operator"
              @change="store.updateFilter(i, { op: $event.target.value })"
            >
              <option v-for="o in FILTER_OPS" :key="o.op" :value="o.op">{{ o.label }}</option>
            </select>
            <input
              v-if="opNeedsValue(f.op)"
              :value="f.value ?? ''"
              type="text"
              placeholder="value"
              aria-label="Value"
              class="flex-1 min-w-[6rem] bg-bg-secondary text-text-primary text-xs font-ui rounded px-2 py-1 placeholder:text-text-hint"
              @input="store.updateFilter(i, { value: $event.target.value })"
            />
            <button
              type="button"
              class="p-1 rounded text-text-hint hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Remove filter"
              @click="store.removeFilter(i)"
            >
              <BaseIcon name="x" :size="12" />
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            variant="soft"
            size="sm"
            icon="plus"
            data-test="add-filter"
            @click="store.addFilter()"
          >
            Filter
          </BaseButton>
          <BaseSegmented
            v-if="store.query.filters.length > 1"
            :model-value="store.query.combinator"
            :options="COMBINATORS"
            size="sm"
            aria-label="Match"
            @update:model-value="store.setCombinator($event)"
          />
          <label class="ml-auto flex items-center gap-1.5 text-xs font-ui text-text-hint">
            Group by
            <select
              :value="store.query.group || ''"
              class="bg-bg-secondary text-text-primary text-xs font-ui rounded px-2 py-1"
              aria-label="Group by"
              @change="store.setGroup($event.target.value || null)"
            >
              <option value="">none</option>
              <option v-for="fd in store.fields" :key="fd.key" :value="fd.key">
                {{ fd.label }}
              </option>
            </select>
          </label>
          <BaseButton
            v-if="store.query.filters.length || store.query.group || store.query.sort"
            variant="ghost"
            size="sm"
            @click="store.clear()"
          >
            Clear
          </BaseButton>
        </div>
      </div>
    </BaseSection>

    <BaseSection
      title="Results"
      :meta="store.results.capped ? `first ${ROW_CAP} of ${store.results.total}` : ''"
    >
      <p v-if="store.results.total === 0" class="font-ui text-xs text-text-hint leading-5">
        Nothing matches. Loosen a filter, or pick another dataset.
      </p>
      <div v-else class="overflow-x-auto -mx-1">
        <table class="w-full text-xs font-ui" data-test="results">
          <thead>
            <tr class="text-left text-text-hint">
              <th
                v-for="fd in store.columns"
                :key="fd.key"
                class="px-1 py-1.5 font-medium whitespace-nowrap cursor-pointer select-none hover:text-text-secondary"
                :aria-sort="
                  store.query.sort?.field === fd.key
                    ? store.query.sort.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                "
                @click="toggleSort(fd)"
              >
                {{ fd.label }}
                <span v-if="store.query.sort?.field === fd.key" class="text-accent">{{
                  store.query.sort.dir === 'asc' ? '▲' : '▼'
                }}</span>
              </th>
            </tr>
          </thead>
          <template v-if="groupEntries">
            <tbody v-for="[groupKey, groupRows] in groupEntries" :key="groupKey" data-test="group">
              <tr>
                <td
                  :colspan="store.columns.length"
                  class="pt-3 pb-1 px-1 label-micro text-text-hint"
                >
                  {{ groupKey === NONE_GROUP ? 'none' : groupKey }}
                  <span class="tabular-nums">· {{ groupRows.length }}</span>
                </td>
              </tr>
              <tr
                v-for="row in groupRows"
                :key="row.id"
                class="border-t border-border-subtle text-text-primary"
                data-test="row"
              >
                <td
                  v-for="fd in store.columns"
                  :key="fd.key"
                  class="px-1 py-1.5 align-top max-w-[16rem]"
                  :class="fd.editable ? 'cursor-text' : ''"
                  @dblclick="startEdit(row, fd)"
                >
                  <input
                    v-if="isEditing(row, fd)"
                    v-model="draft"
                    class="w-full bg-bg-elevated text-text-primary rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    autofocus
                    @keydown.enter.prevent="commitEdit(row, fd)"
                    @keydown.esc.prevent="cancelEdit"
                    @blur="commitEdit(row, fd)"
                  />
                  <span v-else class="line-clamp-2">{{ display(row, fd) }}</span>
                </td>
              </tr>
            </tbody>
          </template>
          <tbody v-else>
            <tr
              v-for="row in store.results.rows"
              :key="row.id"
              class="border-t border-border-subtle text-text-primary"
              data-test="row"
            >
              <td
                v-for="fd in store.columns"
                :key="fd.key"
                class="px-1 py-1.5 align-top max-w-[16rem]"
                :class="fd.editable ? 'cursor-text' : ''"
                @dblclick="startEdit(row, fd)"
              >
                <input
                  v-if="isEditing(row, fd)"
                  v-model="draft"
                  class="w-full bg-bg-elevated text-text-primary rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  autofocus
                  @keydown.enter.prevent="commitEdit(row, fd)"
                  @keydown.esc.prevent="cancelEdit"
                  @blur="commitEdit(row, fd)"
                />
                <span v-else class="line-clamp-2">{{ display(row, fd) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 font-ui text-[11px] text-text-hint">Double-click a cell to edit it.</p>
      </div>
    </BaseSection>
  </div>
</template>
