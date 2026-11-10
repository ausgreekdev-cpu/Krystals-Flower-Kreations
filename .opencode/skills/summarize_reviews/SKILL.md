---
name: summarize_reviews
description: Code skill implemented in backend/src/agents/skills/summarize_reviews.js
---
# summarize_reviews

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
