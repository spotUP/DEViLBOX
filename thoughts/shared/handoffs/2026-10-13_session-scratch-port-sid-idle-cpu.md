---
date: 2026-10-13
topic: Session handoff - demo scratch full port, SID deck audit, app idle CPU
tags: [handoff, scratch, dj, sid, idle-cpu, push]
status: final
---

# Session handoff 2026-10-12/13

## Tasks

1. **SCRATCH-FULL-DEMO-PORT** (owner top priority). Definition of done, from the owner: "everything fully ported, nothing skipped". 78 of 81 rows closed. Open: R6 (port the vocalstab speech synth, not started), then R12, then D2 (parameter panel, about 40 knobs).
2. **SID-DECK-AUDIT + SID-DECK-FOLLOWUP + SID-FOLLOWUP-2**: done, with owner live checks passed (3, 6 and 9 scopes; Venus/La_Mer oscilloscope at 125.31 BPM). The SID-FOLLOWUP-2 owner checks are not done yet (see Next Steps).
3. **APP-IDLE-CPU** (was DJ-IDLE-CPU): visuals near zero at idle; the audio thread is still about 28 % of a core idle. Commits d42f609e3, 1b147c789, 60ee5cc96.

## Critical references

- Scratch ledger: `thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md` (owner decisions at the top, running count).
- Scratch final handoff: `thoughts/shared/handoffs/2026-10-13_scratch-final.md` (order for R6, R12, D2).
- Earlier phase handoffs: `2026-10-12_scratch-null-test.md`, `2026-10-12_scratch-pg-j.md`, `2026-10-13_scratch-p13.md`, `2026-10-13_scratch-render-mode.md`, `2026-10-13_scratch-pg-i.md`.
- Research: `thoughts/shared/research/2026-10-12_scratch-null-test.md`, `2026-10-12_demo-scratch-engine-port-gap.md`.
- Ledger of every item and decision: `thoughts/spot/todos.md` (search SCR-, SID-, APP-IDLE-CPU, FLAKE-, PRE-COMMIT-).

## Owner decisions this session (do not re-litigate)

- The scratch demo wins every conflict (O1-O7). No row exempt; parity is never claimed while a row is open.
- P13: DEViLBOX extras sit on top of the exact demo plan. J3/J6: ship the amen break and juggle records. The section-end tail rides over (render_scratch_section).
- Render mode is an Auto Scratch setting; the default is three_deck. R5: a phrase WAV is dropped on Deck C. X7: render ahead. X8: only with J10. The Three Deck Showcase action plays the routine's A/B layer. Port vocalstab (do not ship its renders).
- Juggle Now skips the intensity wobble. SID: mono stems, wire every SID Settings control, phrase edges fixed, accept Venus refusing.
- Idle CPU: localhost graph probes approved (never on live).

## Learnings / gotchas

- The MCP relay keeps only the newest tab. The owner's live tab captured it once and an agent switched the owner's live view. Check location.href before any MCP action.
- The pre-commit hook tests the WORKING TREE, so one agent's WIP blocks everyone's commits (PRE-COMMIT-TESTS-WORKING-TREE). The affected-test selector also missed importers (fixed in a90de808e).
- Pre-push tests flake at machine load above 40 (offlineSuspendBeforeRenderIsHonoured, restoreReplaysEdits). Push only when agents are idle (FLAKE-OFFLINE-SUSPEND + LOAD-FLAKES).
- Agents sharing the session scratchpad overwrote each other's commit message files, so 60ee5cc96 (idle-CPU work) carries the Deck C BPM message.
- The local `.env` sets VITE_API_URL to localhost:3011 and NODE_ENV=development. Local builds are dev bundles, and a preview build on another port gets blocked by CORS.
- SID renders were slow because every voice was a full re-render; now one websid pass (449fafe44). websid.wasm is now built from vendored sources.

## Next steps (ordered)

1. Confirm the push of 30 commits landed and the live buildHash matches (it was running when this was written).
2. Owner decision: reword 60ee5cc96's message (a history rewrite, needs approval) or leave it.
3. Owner decision: the live scratch-level follower starts each bus at level 1 (the first bar measures 0.98 instead of 0.60). Pick a start estimate or a fade-in. Also bind a key for `dj_three_deck_showcase`.
4. Scratch: R6 vocalstab port, R12, D2 (fresh opus agent per the scratch-final handoff). Also the pad-stroke 1 ms grid test, and the module-deck/Showcase loudness measured live.
5. Idle CPU: the last ~28 % audio thread needs an intent-woken unplug of the whole master graph (ctx.suspend is excluded for latency). Other open items: pattern/offscreen worker 3-5 %, MK2 screen loop, LiveFilterCurve/JC303 loops, scratch-reverse node detach. Still owed: picture readings with audio running.
6. Interaction to check: the idle unplug of silent decks may blind the scratch level follower right after a deck starts.
7. PRE-COMMIT-TESTS-WORKING-TREE (sonnet), FLAKE-OFFLINE-SUSPEND + LOAD-FLAKES (opus), AUTODJ-MIX-IN-OFF-BEAT, PT1210-PORT plan, useTabsStore.nativeTeardown (reported failing on HEAD by one agent, passing by another).

## Owner manual checks still open (LOCAL http://localhost:5174 unless stated)

- Three Deck Showcase: in the Auto DJ panel, press "Three Deck Showcase" with A/B playing. Pass: A/B pause, an 83 s routine plays, the Deck C platter and faders move, A/B resume where they stopped, the crossfader never moves, and Deck C shows the A/B tempo.
- Scratch density (MUSICAL, hip-hop playlist): roughly every second bar has a scratch.
- Render modes: Three Deck Routine (needle drop/lift, silent around bars 20-23 and 28-29), DJ Routine, Section Overlay.
- Phrase WAV dropped on Deck C gives "Scratch phrase: <name>".
- Idle wake: after 5 s of silence, play, scratch, cue or fire an effect. No click or lag, and tails ring out fully.
- SID-FOLLOWUP-2: nightmare on acid.s3m shows 16 CH buttons and muting works; La_Mer juggles; NTSC clock is faster; turning off Chip 2 Voice 1 silences that voice. Restart `npm run dev` first.
