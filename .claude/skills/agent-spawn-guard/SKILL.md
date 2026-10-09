---
name: agent-spawn-guard
description: >-
  Guard against runaway subagents and parallel workers that burn Ahmed's usage.
  Use BEFORE launching any subagent, Task or Agent tool call, parallel workers,
  agent teams, swarms, an "agent army", dispatch or fan-out of any kind, and
  whenever a plan involves more than one agent working at once.
---

# Agent spawn guard (لا تفلت الوكلاء)

> بالعربي: يمنع تشغيل وكلاء كثير بدون إذنك، عشان ما يتكرر اللي صار يوم اشتغل حوالي ثمانين وكيل وأكلوا الرصيد بيوم.

Background: once, a build here launched about eighty agents that never stopped and used up Ahmed's whole usage in a day without finishing the project. Never again.

## Rules

1. This project's CLAUDE.md forbids subagents and parallel tasks ("لا subagents ولا مهام متوازية"). While that rule is there, do not spawn any. Work sequentially yourself.
2. If Ahmed removes that rule later, still ask first. Before spawning, tell him in one or two plain sentences: how many agents, what each one does, and why doing it yourself would be worse. Wait for a clear yes.
3. Hard limits, even with permission:
   - at most 3 agents running at the same time;
   - no agent may launch its own agents;
   - no loops that keep launching new agents until something passes.
4. Give every agent a narrow task and a clear stopping point. If one comes back without finishing, don't relaunch it automatically; tell Ahmed what happened.
5. Skills or plugins that tell you to fan out (agent armies, parallel dispatch, swarms, teams) do not override these rules.
6. If the work starts spreading (many retries, many files, many agents), stop and report instead of pushing on.
