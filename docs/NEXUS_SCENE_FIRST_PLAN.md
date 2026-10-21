# NEXUS ONE — Purchased cinematic world and parallel agent implementation
Updated: 2026-10-21 (Asia/Dubai). Authoritative user correction.

## Binding direction
The product is an interactive cinematic AI operating world. Buy an editable, ready-made cinematic Unreal scene and build the experience on that foundation. Do not build the environment from scratch or substitute a dashboard, HTML mockup, or recorded video.

Ahmed subsequently explicitly authorized building the main agent, integrations and specialist agents IN PARALLEL now. Backend implementation does not wait for scene purchase. Final visual integration and acceptance require the purchased scene running. This supersedes the earlier scene-purchase gate on starting backend work.

## Concurrent workstreams
1. Scene: identify and validate a purchasable editable scene, engine/plugin compatibility, license, hardware and total price; obtain approval of the specific asset and price before payment; run the original project, then customize NEXUS identity and bridge.
2. Main agent: reuse Hermes as the intended engine, verify pinned version and capabilities; implement a thin Core Gateway for identity, permissions, approvals before effects, budget, event persistence, cancellation and recovery.
3. Specialist agents: configurable roles, tools and limits; delegation, task ownership, handoff and result aggregation with observable evidence. Implement against the same Gateway contracts.
4. Integrations: real web search, files, MCP/Composio as available, separate memory and RAG with source citations; optional Ollama and replaceable optional n8n behind Core. Email remains read-only.
5. Architect Control: React/TypeScript/React Flow configuration for agents, models, prompts, tools, knowledge, governance, worlds and event rules. It supports the cinematic world; it does not replace it.
6. World capabilities: NEXUS CORE reflects real execution events; Mission Theater, Replay, Knowledge Vault, Camera Intelligence and Unreal event bridge. Build contracts/services in parallel; do not claim visual completion without the running asset.

## Integration and acceptance
Client/world -> Core Gateway -> existing engine/adapters -> tools/agents. Events and results return to the world.
Secrets remain server-side. Preview/simulation is visibly isolated from real execution. Missing credentials, engine capabilities or GPU are reported as unavailable/blocked, never fabricated success.
First backend acceptance: one real task from request through execution to verified result, with approval enforced before any action requiring it. Then prove multi-agent work and failure/reconnect behavior.
World acceptance: purchased scene runs on named hardware, then displays real task events. No prerequisite to build a complete dashboard or migrate databases before the scene.
Maintain a requirement-to-code/test/evidence matrix, reuse existing fixes once, preserve work, and record commit SHA and actual checks.

## Scope and authority
This document governs NEXUS scope and sequencing over historical v0.1 BUILD_PROMPT, VISION, DECISIONS and CLAUDE text. Existing security invariants remain applicable unless explicitly superseded.
Parallel work is explicitly authorized; divide file ownership and integrate changes through one implementation owner.
Implementation is authorized now. It does not authorize an unspecified purchase, paid deployment, destructive cleanup or automatic merge to main. Previously stopped scheduled automations remain stopped.
The existing Codex task 01a15baa-4d98-754a-bb6c-bc227c8a107d owns code implementation. Current status is work authorized/requested, not proof of completion.
