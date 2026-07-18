---
date: 2026-07-17
topic: suntronic-native-pitchslide-and-arp-span-fixes
tags: [suntronic, native-driver, arp, drin, pitch-slide, lockstep]
status: final
---

# SunTronic native driver — two decode bugs closed (pitch-slide width + drin arp span)

## Task(s)

Standing task: finish the **SunTronic V1.3 native driver** toward corpus-wide per-tick
lockstep (native Paula AUD PER/VOL == UADE across all SUNTronicTunes) with fails-on-revert
regression tests in `test:ci`. Driver is NOT "finished" / NOT 1:1 until that gate is green.

This session (user answer "Fix pitch-slide bug", then "proceed"): closed the two remaining
Version-A decode bugs.

- **Fix 1 — pitch-slide operand width (0x9b)** — DONE, tested. (Was applied at the very
  start of this session; regression test added this session.)
- **Fix 2 — drin arp table span** — DONE, tested. (Full work this session.)

Both UNCOMMITTED. User's last message was "write a full handoff so we can start fresh" —
i.e. commit was NOT yet authorized; confirm before committing.

## Recent Changes (this session)

All local, uncommitted. Git status of the relevant files:
```
 M package.json                                 (test:ci glob: +2 test files)
 M src/engine/suntronic/SunTronicPlayer.ts      (0x9b width @378, drin span @251)
 M src/lib/import/formats/SunTronicV13.ts        (drin extraction @821)
?? src/engine/suntronic/__tests__/sunTronicPitchSlideVersion.test.ts
?? src/engine/suntronic/__tests__/sunTronicArpTableSpan.test.ts
```
(`M tools/suntronic-re/probe-ab-wav.ts` is pre-existing, unrelated. The hundreds of
`?? public/data/songs/SUNTronicTunes/*` are the SEPARATE UNTRACKED corpus dir — NEVER
`git add` those; add fix files BY NAME ONLY. Tracked corpus is
`public/data/songs/formats/SUNTronicTunes` = CORPUS_DIR.)

### Fix 1: pitch-slide operand width is driver-version-dependent (0x9b)
`SunTronicPlayer.ts:371-382` (case 0x9b). Main (GNN4 @DP_Suntronic.s:510) reads a
big-endian WORD (2 bytes); Version-A (GNN4a @1034) reads ONE sign-extended byte
(`MOVE.B; EXT.W`). Same arpShift split that governs drin governs this. Native hardcoded
word-read → every Version-A song scaled the slide ~256x (byte 0x7f → 0x7fXX ~32000,
wrapping pitch through [0,0x4800) into garbage/wrong-sign) AND swallowed the next stream
byte, desyncing the group. Fix:
```ts
const wide = this.arpShift >= 4;
if (v.tie !== 0) { a1 += wide ? 2 : 1; break; }
v.pitchSlide = wide ? s16((rd() << 8) | rd()) : s8(rd());
```
Result: PER-mismatch 5→3. Closed Suntronic-13, suntronic-n3 (pre-fix Suntronic-13 v2 slid
wrong-sign 91→87→83; now glides 101→194 ascending, byte-exact vs UADE at sub-tick anchors).

### Fix 2: drin arp table spans the full byte-valued arpSel range
Two sites — BOTH had to change (parser fix alone was silently re-truncated by the player):
- `SunTronicV13.ts:821` — `const drin = new Int8Array(256 << arpShift);` (2048 Version-A /
  4096 Main), bounded read `drinOff + i < h1.length`. Was `(1<<arpShift)*16` = 128/256.
- `SunTronicPlayer.ts:251` — `this.drin = opts.drin ?? score.drin ?? new Int8Array(256 << arpShift);`
  Was rebuilding a `(1<<arpShift)*16` copy and `.set(score.drin.subarray(0,128))`.

Root cause: arpSel is a FULL BYTE (the 0x9c opcode reads a raw operand), and the replayer
raw-indexes module RAM at `d5 = (arpSel<<shift)+phase` with NO bound (EFFECTSa
@DP_Suntronic.s:910-930, esp. `SUB.B (A3,D5.W),D1` @930). suntronic-k3/k4 v0 use arpSel=17
→ d5 = (17<<3)+phase = 136..143, all out of range of the 128-byte slice → `drin[d5] ?? 0`
= 0 → arp offset vanished. Native held one note and only crept with the pitch slide
(period 360→364→369…) where UADE sweeps the arp.

Post-fix native k3 v0 sweeps byte-exact `360,486,657,891,1203,1632,2204,2987` vs UADE
AUD0PER (Δ=0 at aligned ticks). arpSel=17 row `drin[136..143] = 0,-5,-10,-15,-20,-25,-30,-35`.
Result: PER-mismatch 3→1, perfect voices 625→626→626, no Main golden regression.

### Regression tests (both in test:ci glob, both fails-on-revert verified)
- `sunTronicPitchSlideVersion.test.ts` — Suntronic-13 v2 (Version-A): slide is 1 signed
  byte (|s|<256), period monotone-ascending, byte-exact 119/146/179 @ anchor ticks 6/13/20.
  Forcing `wide=true` → 3/3 fail.
- `sunTronicArpTableSpan.test.ts` — k3 v0: `score.drin.length===2048`, arpSel=17 ramp
  exact, sweep max>=2900, periods byte-exact `[360,486,657,891,1203,1632,2204,2987]`.
  Reverting EITHER truncation (parser or player) fails.

## Verification done
- `npm run type-check` (tsc -b --force) clean.
- `npx vitest run src/engine/suntronic/__tests__/` → 20 files / 76 tests pass, 0 fail
  (gliders/ballblaser Main goldens unchanged — Main drin now 4096, low indices identical).
- Corpus gate `probe-vol-corpus.ts 80 200`: songs-with-PER-mismatch **5→1**, perfect
  voices **626/700**, VOL-mismatch 36 songs (unchanged = stub #3).
- NOT run: full `npm run test:ci` (long) — do before committing/pushing.

## Learnings
- `voiceFidelity` xcorr is pitch/phase-BLIND — never a gate. The lockstep gate is native
  `stepVblankOnce()` period vs UADE `render(882)` last-PER-write, both on the ~882.759 PAL
  vblank grid (`lockstep-v1-period.ts`, `probe-vol-corpus.ts`).
- A parser fix can be silently undone by a downstream re-copy. The player was rebuilding a
  128-byte drin even after the parser produced 2048. ALWAYS trace the value end-to-end
  (parser → score → player field) before concluding a data-shape fix landed. probe
  `probe-k3-drin.ts` reported `drin.len 128` after the parser edit → caught it.
- arpSel/arp-index tables in these replayers are raw RAM indices with NO bound — size the
  extracted slice to the full operand range (byte → 256 selectors), not a guessed count.
- Driver-version (arpShift 4=Main / 3=Version-A) governs MULTIPLE things: drin phase mask,
  drin row width, AND the 0x9b pitch-slide operand width. Suspect it for any Version-A-only
  divergence.

## Key References
- `src/engine/suntronic/SunTronicPlayer.ts` — 0x9b @371-382, drin init @247-252,
  arp index `d5` @468, `drin[d5]` @475.
- `src/lib/import/formats/SunTronicV13.ts` — drin signature-locate @798-815, extraction
  @821-822, score fields drinOff/arpShift/drin @935-937.
- `docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s` — EFFECTS (Main) @415-486;
  EFFECTSa (Version-A) @895-944 (arp index @910-914, `SUB.B (A3,D5.W),D1` @930); GNN4 word
  pitch-slide @510-517; GNN4a byte pitch-slide @1034-1040; PERIODS table @1128-1133
  (ASCENDING).
- Probes (tools/suntronic-re/, untracked): `lockstep-v1-period.ts <song> <ticks> <v>`
  (real gate), `probe-vol-corpus.ts <ticks> <cap>` (corpus PER+VOL gate),
  `probe-marp-ram.ts <song> <ticks> <v>` (UADE RAM voice-struct oracle: $08 pitch, $0A
  slide, $0E arpSel, $0F phase, $20 period), `probe-k3-int.ts` (native voice internals),
  `probe-k3-drin.ts` (native drin table + arp state — NEW this session), `probe-k3-v0.ts`
  (snapshot — fields show "·" for pitch/arp; use probe-k3-int/drin instead).
- Memory `project_suntronic_native_meter_blindspot.md` — stub table UPDATED: #5 (pitch-slide,
  FIXED), #6 (drin span, FIXED, NEW). #1 arp/drin base fix + #4 vol-slide already there.

## Next Steps (ordered)
1. **Commit** the two fixes (await user OK). Suggested split: one commit per fix, or one
   "close Version-A pitch-slide + arp-span decode bugs" commit. Add BY NAME:
   `SunTronicPlayer.ts SunTronicV13.ts package.json
   src/engine/suntronic/__tests__/sunTronicPitchSlideVersion.test.ts
   src/engine/suntronic/__tests__/sunTronicArpTableSpan.test.ts`.
   Run full `npm run test:ci` before push. NEVER `git add -A`/`.` (untracked corpus dir).
2. **Last PER residual = `tank1` v1/v3 78/80** (Main, ±2-tick). NOT a decode bug — stub #3
   sub-tick Paula-DMA drift, same root as the 36-song VOL-mismatch cluster (envelope-index
   phase). Prior Phase-0 probe judged the cycle-accurate scheduler port NOT warranted
   (buffer-swap-latch model REFUTED: shipped flat/bucket beat every φ/wrap-latch variant;
   research `thoughts/shared/research/2026-07-17_suntronic-gate-e-scheduler-port.md`). So
   the corpus lockstep gate is 1 PER song + a VOL cluster away from green, and the only
   remaining lever is the deferred scheduler that measurement says not to build. Decision
   for next session: either (a) accept tank1/VOL as scheduler-residual and declare the
   decode layer complete (driver still not byte-exact 1:1, but audibly correct), or (b)
   re-open the scheduler with a NEW probe if the ±2-tick tank1 drift is a distinct, smaller
   root than the swept-voice wobble (unverified — worth a focused lockstep diff on tank1
   before assuming it's #3).
3. Do NOT re-attempt the >>7/×2 volume-envelope edit (proven wrong, regressed corpus) or
   the "+1 render-path latency" (H1 refuted).

## Other Notes
- Driver is NOT finished / NOT 1:1. Do not record it as CLOSED. Gate = corpus-wide per-tick
  AUD PER/VOL lockstep in test:ci.
- UADE is offline-oracle-ONLY for SunTronic (no live browser UADE). `get_audio_level` is
  blind to the native `_nativeContext` — reads peakMax 0 while audio plays. For ear A/B
  render both to WAV via `probe-ab-wav.ts`.
- MEMORY.md index warns it is oversized; topic file
  `project_suntronic_native_meter_blindspot.md` holds the full stub status.

## VOL-residual triage (2026-07-17, post loop-restart fix a0620a3a9)
Corpus gate `probe-vol-corpus.ts` (33 songs sampled, first 80 ticks): **PER mismatch = 0
songs** (headline lockstep green). VOL residual = 4 songs / 6 voices, THREE distinct roots
(NOT one "scheduler drift" bucket):
1. **comming0.src v1 — phantom voice.** UADE `VOLwrites=0` for ch1 the WHOLE song
   (`probe-chgate.ts`): AUDxVOL never written → ch1 plays at volume 0 (silent) though DMA
   enables at t1154. Native plays it at env-volume 63. Native's v1 volEnv = `[64,50]` is
   BYTE-IDENTICAL to v3's (both type-B sampled) — native assigns the same sampled descriptor
   to both, but the real driver gives v1 an effectively-zero-volume instrument. NOT the $37
   synthFlag gate ($37==1 skips BOTH vol+period, but UADE writes v1 PER every tick=508).
   Root = per-voice type-B instrument/volEnv SELECTION edge. Fix needs 68k disassembly of the
   binary driver (`.s` files are compiled Amiga executables, not text) to find which sampled
   record v1 should bind. NOT quick-fixable at loop-tick level.
2. **freak.src v1 — startup VOL-write delay.** UADE first ch1 VOL write at t91; native writes
   from t0. Same instrument/trigger-timing class as #1.
3. **kompo04-mix / kompo05 v1+v2 — envelope+phase drift.** `probe-seam-detail.ts`: native
   period LEADS UADE by exactly 1 tick (native tN period == UADE tN+1) AND native volEnv
   decays to 0 while UADE holds at 14 (loops). = envelope loop-point + 1-tick phase = stub #3
   (Paula-DMA/envelope-timing scheduler drift, judged port-not-warranted).
Verdict: no CHEAP remaining decode fix. The largest VOL residual (comming0/freak) is a
type-B instrument-selection RE task; the rest is the deferred scheduler. Probes added
(untracked, tools/suntronic-re/): probe-chraw.ts, probe-chgate.ts, probe-v1inst.ts.
