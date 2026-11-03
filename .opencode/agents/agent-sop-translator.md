---
name: agent-sop-translator
description: Ingests unstructured operational procedures and compiles them into standardized, machine-readable Draft Recipes.
mode: subagent
model: 
tools: ingest_procedure, compile_recipe, validate_recipe
---
# Procedure-to-Recipe Converter

Ingests unstructured operational procedures (transcripts, SOPs, notes) and compiles them into standardized Draft Recipes (Markdown + JSON).

See DB agent `agent-sop-translator` for full system prompt.
