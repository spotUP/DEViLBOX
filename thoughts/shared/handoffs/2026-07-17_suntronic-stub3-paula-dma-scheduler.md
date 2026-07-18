---
date: 2026-07-17
topic: suntronic-native-stub3-paula-dma-scheduler
tags: [suntronic, native-player, paula-dma, fidelity, lockstep, gate-e]
status: draft
---

# SunTronic native driver — stub #3 (Paula-DMA scheduler) handoff

Fresh-start brief for the LAST open SunTronic native-driver stub. Stubs #1, #2,
#4 are closed and committed. #3 is the only thing between the current state and a
1:1 driver. It is a structural port, not a one-liner, and the prior model of it
was REFUTED — so this starts with measurement, not code.

## Hard rules (carry forward, non-negotiable)

- **Never call the driver finished / 1:1 / CLOSED / "ships as default" until the
  corpus-wide per-tick lockstep (AUD PER + VOL native == UADE across all
  SUNTronicTunes) passes in `test:ci`.** Prior sessions falsely claimed this
  three times. The user's exact words: *"never claim the driver finished when
  its not. that's plain lies from you. not nice."*
- **Every fix ships a fails-on-revert regression wired into `test:ci`.** Revert
  the fix, prove the test goes red, restore.
- **Measure before coding.** One decisive probe beats three plausible patches.
  #3's prior "buffer-swap-latch" model was refuted by a probe — do not re-assume
  it. Build the discriminating measurement first.
- **UADE is offline-oracle-ONLY for SunTronic** (PHASE 4). No live browser UADE.
  Native default in `devilbox-settings` must NOT be reverted.
- **`voiceFidelity` xcorr is pitch/phase-BLIND** (re-aligns each window). It
  wrongly passed a zero-arp voice and a mis-timed onset. NEVER use it as the gate.
  The gate is per-tick lockstep via the Paula log / voice-struct RAM read.
- Commit/push only when the user asks. `git add` by name, never `-A`/`.`. Never
  `--no-verify`. `npm run type-check` after every change.
- CAVEMAN MODE full is active (terse prose; code/commits normal).

## Task

Close stub #3: the cycle-accurate Paula-DMA scheduler. Symptom = accumulated
**sub-tick phase drift** between native `stepVblankOnce()` (one clean player step
per 882.759-sample PAL vblank) and UADE. It shows as UADE holding a period/volume
an extra render tick where native steps cleanly — the "phase holds" visible in the
RAM trace below. Mean values match; the misalignment is in WHICH tick a
transition lands on. On swept/moving voices this compounds to a ~1 s wobble; on
static voices it is invisible (which is why #1/#2/#4 could be locked exactly on
static/early-window witnesses).

## Current state — what's DONE (do not redo)

Three stubs closed this session, all committed to `main` (NOT pushed):

| # | stub | commit | regression |
|---|------|--------|------------|
| 1 | arp/drin note-transpose table (was zero-filled) | `cd035e48d` | `sunTronicArpLockstep.test.ts` |
| 2 | Paula AUDxVOL 6-bit clamp (64→63) | `cd035e48d` | `sunTronicVolClamp.test.ts` |
| 4 | 0x9b pitch slide / deep arp (0x9a read 1 byte not 2) | `7ee9dcb4d` | `sunTronicPitchSlide.test.ts` |

- #1: `drin` is plain hunk#1 module data, signature-located in the parser
  (`SunTronicV13.ts`), threaded as `score.drin` + `arpShift`/`arpPhaseMask`.
  Main = ×16/256B/phase&0x0f, Version-A = ×8/128B/phase&0x07.
- #2: `paulaAudxVol(v) = v & 64 ? 63 : v & 63` at the Paula boundary in
  `SunTronicNativeRender.ts`. The disasm's "masterVolA/B ×3" theory was a RED
  HERRING (corpus master words are identity).
- #4: control opcode `0x9a` (`-$66`) now reads ONE byte to `$0D` (disasm GNN5).
  The fabricated `$32/$33` vol-slide counter + gated advance were removed;
  vol-slide is ungated every tick, clamp [0,0x80], slide not zeroed at limits
  (disasm EFF1/EFF2). Removed `envReload`/`envCounter` struct fields.

Nothing above depends on #3. All are exact on their witnesses.

## The measurement that pins #3 (start here)

Native voice-1 period on `multi-arp-long.src` is byte-exact vs the UADE **RAM**
oracle EXCEPT where UADE holds. Compare:

```
tick  UADE $20 (RAM)   native (clean vblank)
0     174              174   ok
1     111              111   ok
2     112              112   ok
3     217  \ HOLD      217   ok
4     217  /           349   <-- native already advanced; UADE repeated t3
5     349              122
...
10    852  \ HOLD      852
11    852  /           323
12    (reset 3584)     (reset 3584, but native reset at t12, UADE at t13)
```

The UADE `$0F` (arp phase) column does NOT advance +1 every render — it holds
(t3==t4 phase 4, t10==t11 phase 11). That hold is one Paula DMA cycle of slack:
UADE's audio DMA had not yet consumed the buffer / the 882.759-sample fractional
frame accumulator had not yet ticked the CIA. Native's `stepVblankOnce()` advances
exactly once per 882.759 samples with no fractional carry, so it never holds.

**This is the whole defect.** It is timing quantization, not arithmetic — every
period/volume VALUE native produces is already correct (proven byte-exact on the
non-held ticks). The question is only WHICH render tick each value lands on.

### Three suspected native drift sources (from prior research, unverified)

1. Per-frame phase reset: native regenerates the timbre buffer on the 882.759
   VBLANK grid and resets buffer phase each frame; UADE's Paula reads chip RAM
   continuously (phase carries across frames).
2. Period latch quantization: an earlier native path bucketed periods to 1024
   samples. Verify this is gone (onset fix f361c07c6 moved to vblank grid).
3. VBLANK fractional accumulator: 882.759 is fractional; native may floor it,
   UADE carries the .759 → every ~4 frames UADE inserts the extra hold.

Source #3 is the leading hypothesis (it exactly predicts a hold every ~1/0.759 ≈
1.3 frames on a fast-advancing voice). PROVE IT before porting: instrument
whether UADE holds correlate with the fractional-frame accumulator crossing an
integer boundary.

### Probe to build first (discriminating experiment)

Extend `tools/suntronic-re/probe-marp-ram.ts` (version-independent voice-struct
RAM oracle, dynamic PC-find — already committed) to also read UADE's CIA/vblank
tick counter and the audio fractional accumulator per render, and log alongside
native's per-vblank step index. Decisive output: does every UADE `$0F` hold
coincide with a fractional-frame wrap? If yes → source #3, and the port is a
fractional-sample accumulator in the render loop (small, tractable). If no → the
buffer-swap-latch model may be back on the table (but it was refuted once — see
below), or it's per-voice DMA fetch phase (source #1, larger port).

## Prior REFUTED model (do not repeat blindly)

`tools/suntronic-re/probe-resampler-phase.ts` (from a prior session, may be
untracked) tested a **buffer-swap-latch** scheduler model against ballblaser and
found the SHIPPED flat/bucket resampler BEAT every φ/WRAP-LATCH variant
(ballblaser v0 0.65 shipped vs ≤0.52; gate was ≥0.90). Conclusion recorded: that
specific model is refuted, not merely untuned. So: the drift is real, but it is
NOT a resampler buffer-swap-latch. Most likely it is upstream — the CIA/vblank
tick cadence feeding the player, i.e. WHEN `stepVblankOnce()` is allowed to fire,
not how the buffer is resampled. Re-measure with the accumulator probe above.

## Critical references

- `src/engine/suntronic/SunTronicNativeRender.ts:20-34` — KNOWN APPROXIMATIONS
  doc block; line 32 names the deferred scheduler; line 183 the swept-voice
  residual note. This is the file the port lands in.
- `src/engine/suntronic/SunTronicPlayer.ts` — `stepVblankOnce()` (one player step
  per PAL vblank), `stepEffects()` (period/vol compute + advance). The scheduler
  change is about how OFTEN/WHEN these fire, not their math.
- UADE Paula-DMA source (the model to port), in `third-party/uade-3.05/src/`:
  - `custom.c:1291-1304` — hsync DMA word-fetch (Paula pulls a word from chip RAM
    per audio DMA slot).
  - `audio.c:423-510` — per-byte sample emit / DMA state machine.
  - `audio.c:686-688` — `next_sample_evtime` fractional accumulator (THE .759).
  - `audio.c:808` — `v & 64 ? 63 : v & 63` AUDxVOL clamp (already ported, #2).
- Paula log ABI (version-independent oracle): `get_paula_log(out, maxEntries)`,
  entry = 3×u32, `[0]=(channel<<24)|(reg<<16)|value`. Regs (`paula_log.h`):
  PER=3, **VOL=4** (not 8), DAT=5, LEN=2, LCH=0. `enable_paula_log(1)` first.
- Voice-struct RAM offsets (loaded record, stride `0x1ba`): `$08` pitch, `$0A`
  slide, `$0C` volume, `$0D` volumeSlide, `$0E` arpSel, `$0F` arpPhase, `$10`
  volEnvIdx, `$14` flags, `$15` outVolume, `$20` period, `$22`/`$24` vibrato.
- Disasm: `docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`. EFFECTS
  arp+vol+period @415-496 (line numbers in this file). PERIODS LUT @1127-1135.
- Existing oracles/probes in `tools/suntronic-re/`:
  - `lockstep-v1-period.ts` — Paula-log AUD{V}PER vs native, version-independent
    (works where p9a's hardcoded PC misses). **The gate template.**
  - `probe-marp-ram.ts` — dynamic-PC voice-struct RAM trace (extend this).
  - `p9a-period-oracle.ts` — RAM oracle but HARDCODED PC 0x2660e (misses on
    `ready` and multi-arp-long — use the dynamic-PC pattern instead).
  - `probe-pc-oracle.ts` — histogram PC-find + gold snapshot alignment.

## Corpus / env

- Corpus (git-tracked): `public/data/songs/formats/SUNTronicTunes` = `CORPUS_DIR`
  in `tools/suntronic-re/suntronicLib.ts`. 133 Main (arpShift 4) + 42 Version-A
  (arpShift 3) + 24 parseFail.
- **DANGER: there is a SEPARATE untracked `public/data/songs/SUNTronicTunes` dir**
  (hundreds of `??` files). NEVER `git add` those. Add fix files by name only.
- Run probes: `TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/<x>.ts`.
  Probes must live UNDER `tools/` for the `@/` path aliases to resolve.
- Test song for #3: `multi-arp-long.src` v1 (fastest-advancing arp → most holds
  per second → highest signal). Also `ballblaser.src` (swept type-2, the ear A/B
  reference) and `gliders.src` (has a byte-exact golden).

## Success criteria (the gate that closes #3 and the driver)

1. A `test:ci` lockstep test asserting native AUD{v}PER **and** AUD{v}VOL ==
   UADE per tick, byte-exact, over a multi-song fixture (multi-arp-long +
   ballblaser + gliders + one Version-A e.g. suntronic-k2), for the full song
   length (not a 12-tick prefix). Fails-on-revert of the scheduler change.
2. gliders/ballblaser goldens still pass.
3. Ear A/B (`tools/suntronic-re/probe-ab-wav.ts` renders native+UADE to WAV
   offline) — swept-voice wobble gone.
4. Only THEN update memory + `SunTronicNativeRender.ts` doc block to remove the
   "KNOWN APPROXIMATIONS" scheduler note, and only THEN may the driver be called
   1:1.

## Next steps (ordered)

1. Build the fractional-accumulator correlation probe (extend `probe-marp-ram.ts`)
   → confirm/refute source #3. Do NOT write scheduler code before this reads GREEN
   on the hypothesis.
2. If source #3 confirmed: add a fractional-sample accumulator to the vblank
   clock in `SunTronicNativeRender.renderInto` so `stepVblankOnce()` fires on the
   same fractional cadence UADE's CIA does (carry the .759, insert the hold).
3. Build the corpus lockstep test (extend `lockstep-v1-period.ts` into a fixture
   generator + assertion, all 4 voices, PER+VOL).
4. Verify fails-on-revert, run full suntronic suite + type-check, ear A/B.
5. Only after GREEN: update `project_suntronic_native_meter_blindspot.md`
   (mark #3 FIXED), the render doc block, and MEMORY.md.

## Other notes

- If the fractional-accumulator port does NOT close it, the next candidate is
  per-voice Paula DMA fetch phase (source #1): each voice's buffer read pointer
  carries across frames in UADE but resets per-frame in native. That is a larger
  change (per-voice sample-accurate read pointer in the resampler). Measure which
  voices drift independently before assuming a global fix covers them.
- The three closed stubs (#1/#2/#4) and this handoff are on `main`, unpushed. If
  the user wants them safe before the #3 campaign, push first (needs explicit ask).
