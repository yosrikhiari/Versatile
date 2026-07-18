# RESOURCES

> Curated links for going deeper on patterns in the Versatile codebase.

## Lessons

| Lesson | Topics |
|--------|--------|
| [Five Patterns of Scalability](lessons/0001-five-patterns-of-scalability.html) | Offline-first, client-side AI, clean architecture, modular frontend, SignalR runway |
| [Carving Monoliths](lessons/0002-carving-monoliths.html) | Service extraction, finding seams, decomposed composables |
| [Idempotency Keys](lessons/0003-idempotency-keys.html) | Safe-to-retry API design, atomic claim step, multi-step recovery |
| [Multi-Tenancy Fundamentals](lessons/0004-multi-tenancy-fundamentals.html) | 3 isolation models, 7 gaps in Versatile, Organization entity ripple effect |
| [Backend Controller Patterns](lessons/0005-backend-controller-patterns.html) | MediatR CQRS flow, error middleware, DI registrations, Clean Architecture seams |

## Reference

- [Scalability Patterns](reference/scalability-patterns.html) — Glossary of terms and file locations
- [Idempotency](reference/idempotency.html) — Key concepts, storage schema, pitfalls

## External

- [Dexie.js docs](https://dexie.org/docs/) — IndexedDB wrapper used by Versatile
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq) — How composables work
- [Pinia docs](https://pinia.vuejs.org/) — Vue 3 state management
- [CQRS pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) — The pattern behind Versatile's backend
- [SignalR docs](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction) — Real-time WebSocket infrastructure
- [Clean Architecture (Jason Taylor)](https://github.com/jasontaylordev/CleanArchitecture) — The template Versatile's backend follows
- [Semaphore pattern](https://en.wikipedia.org/wiki/Semaphore_(programming)) — Concurrency control used in aiService.js
- [Feature-Sliced Design](https://feature-sliced.design/) — Frontend architecture methodology similar to Versatile's composable + service split
- [Extract Service Object (refactoring.com)](https://refactoring.com/catalog/extractFunction.html) — The refactoring behind every extraction in this lesson
- [God Class refactoring](https://sourcemaking.com/antipatterns/god-class) — The anti-pattern that `useVolumeStoryGenerator.js` exhibits
