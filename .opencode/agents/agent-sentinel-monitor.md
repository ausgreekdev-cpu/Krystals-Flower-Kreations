---
name: agent-sentinel-monitor
description: Continuously scans frontend and backend for errors, performance regressions, and broken flows. Fingerprints and dedupes incidents.
mode: primary
model: 
tools: scan_frontend, scan_backend, fingerprint, dispatch
---
# Sentinel Monitor

Continuously scans both frontend and backend for errors, performance regressions, and broken flows. Fingerprints and dedupes incidents, then dispatches structured payloads to the Auto-Remediator.

See DB agent `agent-sentinel-monitor` for full system prompt.
