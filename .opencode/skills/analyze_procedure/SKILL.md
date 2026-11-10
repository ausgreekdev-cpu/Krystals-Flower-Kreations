---
name: analyze_procedure
description: Code skill implemented in backend/src/agents/skills/analyze_procedure.js
---
# analyze_procedure

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
