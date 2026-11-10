---
name: generate_seo_copy
description: Code skill implemented in backend/src/agents/skills/generate_seo_copy.js
---
# generate_seo_copy

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
