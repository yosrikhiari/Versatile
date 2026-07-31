import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { ready } from './services/db-core'
import { bootstrapGuardrails } from './guardrails/bootstrap'
import '@fontsource-variable/geist'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Guardrails need an active Pinia to read the story bible for their ontology.
// `detective` reports findings to the guardrail feed without changing any call's
// failure mode; switch to `blocking` to have failures abort generation.
bootstrapGuardrails({ enforcement: 'detective' })
ready().then(() => {
  app.mount('#app')
})
