---
"@moonshot-ai/agent-core-v2": patch
---

Align v2 subagent capability boundaries with v1: the coder profile is back to its 10-tool coding set (no nested Agent/AgentSwarm spawning, cron, or task-management tools), and the Agent/AgentSwarm tools again accept only the subagent types declared by the caller's profile (coder / explore / plan) instead of the whole profile catalog.
