import { setActivePinia, createPinia } from 'pinia'
import SectionContextSelector from './SectionContextSelector.vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'

export default {
  title: 'Shared/SectionContextSelector',
  component: SectionContextSelector,
  argTypes: {
    sectionCount: { control: 'number' }
  }
}

function buildSections(count) {
  const sections = []
  for (let i = 1; i <= count; i++) {
    sections.push({
      id: `sec-${i}`,
      title: `Chapter ${Math.ceil(i / 2)} — Section ${i}`,
      order: i
    })
  }
  return sections
}

const Template = (args) => ({
  components: { SectionContextSelector },
  setup() {
    setActivePinia(createPinia())

    const msStore = useManuscriptStore()
    msStore.sections = buildSections(args.sectionCount)

    return {}
  },
  template: '<SectionContextSelector panel-id="story-context" />'
})

export const ManySections = Template.bind({})
ManySections.args = {
  sectionCount: 12
}

export const FewSections = Template.bind({})
FewSections.args = {
  sectionCount: 4
}

export const SingleSection = Template.bind({})
SingleSection.args = {
  sectionCount: 1
}
