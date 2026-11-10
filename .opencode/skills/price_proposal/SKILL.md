---
name: price_proposal
description: Code skill implemented in backend/src/agents/skills/price_proposal.js
---
# price_proposal

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
