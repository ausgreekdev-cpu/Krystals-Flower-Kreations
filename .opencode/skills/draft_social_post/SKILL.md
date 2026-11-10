---
name: draft_social_post
description: Code skill implemented in backend/src/agents/skills/draft_social_post.js
---
# draft_social_post

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
