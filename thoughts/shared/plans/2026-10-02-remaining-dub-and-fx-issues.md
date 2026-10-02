---
date: 2026-10-02
topic: Remaining dub bus and master FX issues after the branch review
tags: [dub, master-fx, ledger]
status: draft  # 1 of 9 done, L2 in progress
---

# Remaining issues — ledger

Done = fixed at the root, a regression test in test:ci that fails on the old
code, type-check clean, committed. Live-only checks are listed under
"Owner checks" and never ticked here.

| ID | Issue | Status | Evidence / commit |
|----|-------|--------|-------------------|
| L1 | `set_dub_bus_settings` MCP write errors "Cannot read properties…" (seen live 2026-10-02) | done | 13e8bcb70 — checkDubBusPatch; caller had put fields at top level |
| L2 | Moves the audit flagged SILENT: bassEmphasis, channelMute, delayTimeThrow, hpfRise | in progress | See handoff 2026-10-02_dub-review-rig-and-toggle-lift: delayTimeThrow WORKS (rendered pitch bend), the audit is blind to it; hpfRise only -3.8 dB lows in 1.5 s; bassEmphasis DECLINES (returns null) on channels not read as bass and the audit logs that as SILENT; channelMute not measured (mixer move, not bus) |
| L3 | Spring Wet has two writers: Auto Dub rides vs the stored setting | open | |
| L4 | `getLiveState().echoRateMs.actual` is null on RE-201 (no live delay time in describe()) | open | |
| L5 | O17 Jeskola FreqBomb starts sounding by itself on reload | open | |
| L6 | O15 Chip Metal preset level | open | |
| L7 | O3 Wave Landscape sounds metallic | open | |
| L8 | O4 BadCat silent (never reproduced) | open | |
| L14 | Dub deck PERFORM / EQ / BUS tabs have different heights; switching tabs jumps the layout | open | owner todo |
| L10 | Wet too loud, little bass with bus on: WET_CHAIN_MAKEUP +11 dB on top of the owner's stored return | done | make-up removed; toggle lift only |
| L11 | Faders jump to the click point; knobs start a drag from the stored value, not the shown one | done | relative fader drag; knob drags from shown value |
| L12 (done) | Version Drop says "every channel reads as riddim" while fader labels say lead/chords/skank | open | Two sources: fader labels = getAutoDubCurrentRoles (audio+offline+overrides); planDrop = getChannelProfiles from the CURRENT pattern's notes, which on the owner's Hively song carried no evidence (every axis unknown@0, audibility 0). Fix = one channel-identity source (previous handoff step 2), not a patch |
| L13 | Echo button constantly lit as held | done | DubRouter isHold from move.kind; DubRouter.test.ts |
| L15 | "High pass seems dead" | measured | bus HPF works (60 Hz -65 dB at 1 kHz, rendered); it filters only the wet bus, now well under the dry. Need which control the owner means |
| L17 | testToneStops.test.ts fails: server schema has mode 'pink', test expects ['sine','rich']; predates a0a83f0ad, not in test:ci | open | |
| L16 | Master Bass "no difference" | measured | live: 63 Hz moves ~10 dB across -12..+12 after the make-up removal; the trim ride spends boost that does not fit under the clipper. Owner to re-listen |
| L9 | `src/engine/hively/__tests__/instrumentPlayersHaveTheirOwnOutput.test.ts` failing since eced26399, outside CI | open | |

## Owner checks (live, by ear)
- Toggle lift: hold each toggle at :5174, wash swells while held.
- Firefox: dub bus audible.
- KILL then reload keeps the levels; panic recovers by itself.

## Decisions already made (do not re-litigate)
- Resting sends stay low (0.1-0.2) for throw contrast; toggles get the wet lift (owner chose A).
- WET_CHAIN_MAKEUP carries the send-fed +11 dB; Return knob stays 0..1.
- Spring/echo tail controls are judged with probe: 'tail', never steady return RMS.
