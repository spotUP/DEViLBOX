---
date: 2026-07-16
topic: suntronic-gate-e-cheap-fixes-exhausted
tags: [suntronic, gate-e, fidelity, paula, resampler, decision]
status: final
---

# SunTronic Gate E — cheap fidelity fixes exhausted; only survivor is the mega-port

## State (delivered)

- Native SunTronic playback is the single engine (`suntronic: 'native'`, default ON — do NOT revert).
- Songs play audibly and edit **byte-exact** (golden timelines gliders 0/316, ballblaser 1/316).
- Per-buffer synth kernel byte-exact for types 0–6 (regression tests green, in test:ci).
- **The stated goal — "perfectly editable suntronic songs" — is met.**

## The remaining gap (metric-only)

Oracle-fidelity gap concentrated on SWEPT-arp type-2 (splice) and type-6 (resonator)
voices: ballblaser v0/v3 ~0.50, analgestic2 v0/v3 ~0.60 vs UADE, while STATIC-arp
voices already ~0.85. It is an accumulating sub-sample phase/rate drift in the Paula
resampler under a per-frame-sweeping arp — correct notes, correct per-buffer timbre,
slight phase smear vs the emulator. NOT a note/timeline error.

## Three cheap fixes measured-DEAD (probes, 2026-07-16)

1. φ_v sub-bucket vblank alignment — flat ±0.05, no φ reaches 0.90 (`probe-resampler-phase.ts`).
2. Paula DMA wrap-latch (swap regen at loop boundary) — inert ±0.01 (same probe).
3. DC / metric artifact (Pearson mean-subtracted xcorr) — does not rescue (`probe-metric-dc.ts`).

Detail + tables: `thoughts/shared/plans/2026-07-16-suntronic-resampler-phase-port.md` (Phase 2a VERDICT).

## Only survivor = cycle-accurate Paula-DMA/MEGAEFFECTS scheduler port

The single largest remaining SunTronic effort (Gate-2 0/0), orthogonal to playback +
editability. It would lift the oracle metric on swept-timbre voices to parity. Cost is
large; audible impact is sub-threshold (notes/timbre already correct). **Not started —
needs an explicit cost go-ahead.** `stepVblankOnce()` on the player is the kept hook a
DMA-accurate resampler would drive.

## A/B-listen path (if user wants to judge by ear before deciding the port)

devilbox-tracker MCP dropped when the dev stack was restarted (relay :4003 came back but
the Claude Code MCP client did not reattach). To restore: with `./dev.sh` running and a
browser on localhost:5174, reconnect via `/mcp` in Claude Code, then load ballblaser.src
+ analgestic2.src native, play, A/B against UADE oracle.

## Uncommitted this session (house rule: commit when asked)

- `SunTronicPlayer.stepVblankOnce()` (public raw-vblank audio-clock entry, probe-only today)
- `tools/suntronic-re/probe-resampler-phase.ts`, `probe-metric-dc.ts`
- plan + research doc edits (verdict appended)
- type-check passes (tsc -b --force → 0)

## Ear A/B verdict (2026-07-17) — PORT REJECTED, SunTronic CLOSED

Rendered native vs UADE-oracle mono-sum WAVs (ballblaser, `probe-ab-wav.ts`) and the
user listened side by side: **"they sound very similar to me."** The ~0.50 swept-voice
fidelity number is therefore a metric artifact of the best-lag search window (drift
exceeds 640 samples in some windows), NOT audible degradation — notes, timbre, and mix
match the emulator by ear. The cycle-accurate Paula-DMA scheduler port is **not built**
(disproportionate cost for zero audible gain). SunTronic native playback + editability is
DONE and ships as the default engine.

In-browser A/B was impossible and this is why the offline WAV route was used: native
outputs to a separate AudioContext the in-app `get_audio_level` meter cannot tap (reads
peakMax 0 = false silent, but audio plays), and UADE is offline-oracle-only for SunTronic
(no live browser player — flipping the pref to 'uade' just disables native → real
silence). `get_audio_level` taps the Tone `masterMeter`, blind to `_nativeContext`.

## Recommendation

Stop here. Goal delivered; the mega-port is rejected on measured evidence (ear A/B says
native == UADE). Native default stays. Nothing to revert.
