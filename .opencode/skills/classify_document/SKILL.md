---
name: classify_document
description: Code skill implemented in backend/src/agents/skills/classify_document.js
---
# classify_document

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
