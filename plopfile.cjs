/**
 * Plop scaffolding generators (M-6.2).
 *
 * Usage:
 *   npm run plop            # interactive menu
 *   npm run plop component  # then answer prompts
 *   npm run plop store
 *   npm run plop composable
 *   npm run plop view
 *
 * Every generator emits a matching test stub under src/tests/unit/.
 */
module.exports = function (plop) {
  // ---- component ----
  plop.setGenerator('component', {
    description: 'A Vue SFC (script setup) + Vitest stub',
    prompts: [
      { type: 'input', name: 'name', message: 'Component name (PascalCase):' },
      {
        type: 'input',
        name: 'dir',
        message: 'Subdirectory under src/components/ (e.g. shared, layout):',
        default: 'shared'
      },
      { type: 'input', name: 'description', message: 'One-line description:', default: '' }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/components/{{dir}}/{{pascalCase name}}.vue',
        templateFile: 'plop-templates/component.vue.hbs'
      },
      {
        type: 'add',
        path: 'src/tests/unit/{{pascalCase name}}.test.js',
        templateFile: 'plop-templates/component.test.js.hbs'
      }
    ]
  })

  // ---- composable ----
  plop.setGenerator('composable', {
    description: 'A composable (use*) + Vitest stub',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Composable name (with or without "use" prefix):'
      },
      { type: 'input', name: 'description', message: 'One-line description:', default: '' }
    ],
    actions: (data) => {
      // Normalize to a leading "use" prefix.
      if (data.name && !/^use/i.test(data.name)) data.name = `use-${data.name}`
      return [
        {
          type: 'add',
          path: 'src/composables/{{camelCase name}}.js',
          templateFile: 'plop-templates/composable.js.hbs'
        },
        {
          type: 'add',
          path: 'src/tests/unit/{{camelCase name}}.test.js',
          templateFile: 'plop-templates/composable.test.js.hbs'
        }
      ]
    }
  })

  // ---- store ----
  plop.setGenerator('store', {
    description: 'A Pinia store (setup syntax) + Vitest stub',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Store name WITHOUT the "Store" suffix (e.g. project):'
      },
      { type: 'input', name: 'description', message: 'One-line description:', default: '' }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/stores/{{camelCase name}}Store.js',
        templateFile: 'plop-templates/store.js.hbs'
      },
      {
        type: 'add',
        path: 'src/tests/unit/{{camelCase name}}Store.test.js',
        templateFile: 'plop-templates/store.test.js.hbs'
      }
    ]
  })

  // ---- view ----
  plop.setGenerator('view', {
    description: 'A routed view (src/views) — no test stub',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'View name WITHOUT the "View" suffix (e.g. Settings):'
      },
      { type: 'input', name: 'description', message: 'One-line description:', default: '' }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/views/{{pascalCase name}}View.vue',
        templateFile: 'plop-templates/view.vue.hbs'
      }
    ]
  })
}
