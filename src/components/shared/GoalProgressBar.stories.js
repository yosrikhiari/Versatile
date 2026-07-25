import GoalProgressBar from './GoalProgressBar.vue'

export default {
  title: 'Shared/GoalProgressBar',
  component: GoalProgressBar,
  argTypes: {
    currentWords: { control: 'number' },
    goalWords: { control: 'number' }
  }
}

const Template = (args) => ({
  components: { GoalProgressBar },
  setup: () => ({ args }),
  template: '<GoalProgressBar v-bind="args" @open-settings="console.log(\'open settings\')" />'
})

export const NoGoal = Template.bind({})
NoGoal.args = { currentWords: 0, goalWords: 0 }

export const Halfway = Template.bind({})
Halfway.args = { currentWords: 25000, goalWords: 50000 }

export const NearlyThere = Template.bind({})
NearlyThere.args = { currentWords: 45000, goalWords: 50000 }

export const GoalReached = Template.bind({})
GoalReached.args = { currentWords: 50000, goalWords: 50000 }

export const OverGoal = Template.bind({})
OverGoal.args = { currentWords: 62000, goalWords: 50000 }

export const SmallNumbers = Template.bind({})
SmallNumbers.args = { currentWords: 150, goalWords: 1000 }
