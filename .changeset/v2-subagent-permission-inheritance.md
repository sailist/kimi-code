---
"@moonshot-ai/agent-core-v2": patch
---

Fix sub-agents not inheriting their parent's permission rules and session-approval memory in the v2 engine: rules and "approve for session" patterns granted to the caller are now copied into every spawned, swarmed, init, and forked agent, matching the v1 parent chain.
