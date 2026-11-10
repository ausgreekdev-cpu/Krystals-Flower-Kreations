---
name: draft_email
description: Code skill implemented in backend/src/agents/skills/draft_email.js
---
# draft_email

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
