import { ref } from 'vue'
import TagInput from './TagInput.vue'

export default {
  title: 'Shared/TagInput',
  component: TagInput,
  argTypes: {
    placeholder: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { TagInput },
  setup: () => {
    const tags = ref(args.modelValue || [])
    return { args, tags }
  },
  template: `
    <div>
      <TagInput v-bind="args" v-model="tags" />
      <p class="text-xs text-text-hint mt-2">Tags: {{ JSON.stringify(tags) }}</p>
    </div>
  `
})

export const Empty = Template.bind({})
Empty.args = { modelValue: [], placeholder: 'Type and press Enter...' }

export const WithTags = Template.bind({})
WithTags.args = { modelValue: ['fantasy', 'sci-fi', 'drama'] }

export const SingleTag = Template.bind({})
SingleTag.args = { modelValue: ['romance'] }

export const CustomPlaceholder = Template.bind({})
CustomPlaceholder.args = { modelValue: [], placeholder: 'Add genre...' }
