---
"@moonshot-ai/agent-core-v2": patch
"@moonshot-ai/kap-server": patch
---

Stop a broken config.toml from destroying user configuration in the v2 engine, restoring the v1 defenses: startup fails fast on an unparseable file, mid-run reloads keep the last good config on any file error, settings writes are rejected while the on-disk file is invalid, and entry-keyed sections (providers/models/platforms) again salvage only their invalid entries instead of dropping the whole section.
