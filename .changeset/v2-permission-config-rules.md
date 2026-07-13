---
"@moonshot-ai/agent-core-v2": patch
---

Fix the `[permission]` deny/allow/ask rules never taking effect in the v2 engine: they are now seeded into every agent's rules model at agent creation, matching the v1 engine's `initialRules`.
