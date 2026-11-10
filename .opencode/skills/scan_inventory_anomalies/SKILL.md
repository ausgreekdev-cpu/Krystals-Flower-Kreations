---
name: scan_inventory_anomalies
description: Code skill implemented in backend/src/agents/skills/scan_inventory_anomalies.js
---
# scan_inventory_anomalies

Trigger: when the corresponding agent needs this capability.
Steps: call the code skill via /api/agent-registry/run with type=skill.
Rollback: deterministic fallback if LLM unavailable.
