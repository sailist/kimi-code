---
"@moonshot-ai/agent-core-v2": patch
"@moonshot-ai/kimi-code-oauth": patch
---

Fix `config.set(domain, undefined)` being a silent no-op in the v2 engine so it actually clears the domain (matching `replace(domain, undefined)`): deleting a provider now unpins it as the default, and logout clears the managed default model, thinking, and default provider instead of leaving dangling pointers that break the next model resolution.
