---
name: match_materials
description: Code skill implemented in backend/src/agents/skills/match_materials.js
---
# match_materials

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
