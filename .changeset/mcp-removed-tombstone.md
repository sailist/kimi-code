---
"@moonshot-ai/kimi-code": patch
---

Keep live sessions stable when an MCP server is removed from the workspace config: its tools stay registered and return a removal notice instead of breaking in-flight calls, and the MCP panel shows the removed status. Removing or disabling a plugin applies immediately with the same tombstone behavior, while installing or enabling one takes effect on /reload or in new sessions.
