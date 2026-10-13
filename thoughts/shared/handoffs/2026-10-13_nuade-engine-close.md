---
date: 2026-10-13
topic: nuade engine close-out - credits, reachability test, DJ decks, node sizing, CI failures
tags: [nuade, handoff, dj, credits, ci]
status: final
---

## Task
Finish thoughts/shared/plans/2026-10-13-nuade-engine.md. Count 149 of 162.

## Critical references
- Plan, section "Phases 6-8, the CI failures and what is left" at the end.
- Commits (not pushed): b3f582c8d credits + reachability test; 73107dffb DJ render; 08242a402 CI fix, NAB-2, dual rows, node sizing.
- Engine: src/engine/nuade/NuadeEngine.ts (resizeNode), nuadeDriver.ts, nuadeCredits.ts; DJ: src/engine/dj/djRenderEngine.ts, src/workers/dj-render.worker.ts renderWithNuade.
- Rules for defaults: tools/nuade/verdictRules.ts (EDIT_SOUNDS_ON_NUADE, dualDefault ownEditPath, ownRefused), apply-verdicts.ts.

## Learnings
- Tests that import songs meet nuade's probe: src/test/nuadeNodeProbe.setup.ts answers it from Node. Never rely on rollout data in a test: pin the choice.
- The pre-push gate selects tests by proximity; defaults in nuadeVerdicts.ts need the whole fast tier (now automatic).
- MMDC / Tim Follin open in the scope view because their grid is a UADE scan, before and after nuade.

## Next steps
1. Owner checks (plan, "What is left" 5), then push (batch).
2. Prove typed notes audible through nuade's module swap, then add the row to EDIT_SOUNDS_ON_NUADE.
3. DN-2 decoder plan; DN-3 contact with emoon.
