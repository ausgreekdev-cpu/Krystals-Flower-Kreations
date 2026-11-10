---
name: suggest_reorder
description: Code skill implemented in backend/src/agents/skills/suggest_reorder.js
---
# suggest_reorder

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
