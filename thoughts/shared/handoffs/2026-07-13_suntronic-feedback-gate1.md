---
date: 2026-07-13
topic: suntronic-native-feedback-gate1
tags: [suntronic, uade, native-synth, MEGAEFFECTS, feedback, oracle, phase0, gate1]
status: in-progress
---

# SunTronic native engine — Phase 0 Gate 1: feedback types (CALC3 + CALC14)

Fresh-start handoff. Everything needed to resume the feedback (live-buffer)
synthesis work with no prior context.

## The campaign (why this exists)

Standing `/loop`: **"keep going until all formats are done"** — reverse-engineer
the compiled-68k-player UADE formats into REAL, editable DEViLBOX audio engines so
people author NEW songs with these synth engines (not just play the originals).
User framing (verbatim): *"could we disassemble the most feature complete/advanced
song per format and make them editable so people can create new songs with these
engines?"*

**SunTronic V1.3 is the pilot** — prove ONE format end-to-end (native synthesis of
its voices, byte-exact against UADE) before touching the other ~20 compiled-player
formats. All 21 lossy formats in the ratchet are compiled-68k-player stubs;
SunTronic is the proof-of-concept for the whole idea.

### Phase gating (do NOT skip)

- **Gate 1** = native `renderSynthTick` reproduces UADE's per-tick synth WAVE
  buffers byte-exact (the timbre generator, MEGAEFFECTS).
- **Gate 2** = P6 note-row TIMING oracle (pitch/vol/vibrato/arp-period = the
  separate EFFECTS routine).
- **Phase 4** (native SONG playback from the grid, no UADE) is GATED until Gate 1 +
  Gate 2 both close. Do not start Phase 4 yet.

## Where we are RIGHT NOW

Gate 1 is ~80% done. Per synthesis type (record+0x23):

| Type | Name | Status |
|------|------|--------|
| 0 | linear morph (CALC1) | DONE — direction confirmed by measurement |
| 1 | pulse/noise (CALC2-6) | noise (d1=-1) DONE + committed; **pulse CALC3 = feedback, NOT done** |
| 2 | splice (CALC7) | DONE — golden-locked 11/11 byte-exact |
| 3 | resample (CALC10) | transcribed, NOT oracle-verified; NOT feedback (reads wave1 only) |
| else (4/5/6) | smoothed interp (CALC13/14) | **feedback, NOT done — the main gap** |

**Only remaining Gate-1 gap: the two FEEDBACK paths** — type-1 pulse (CALC3) and
type-else smooth (CALC14). Both synthesise from the voice's own previous-tick
output. Native currently fakes that with constant `wave1` → only tick 0 matches.
gliders.src: feedback types reproduce **0/340** buffers.

## Committed this session (LOCAL, UNPUSHED — await push auth)

- **`3b3a2e95b`** `fix(suntronic): correct type-1 noise PRNG (>>4, write-then-step)`
  - CALC5/6 middle-square had `>>8` (must be `>>4`) and wrote the word AFTER
    stepping (must write BEFORE → `out[0] == seed`).
  - Recovered byte-exact from real UADE chip RAM (mule.src, seed `0x6d77`):
    `d0_next = ((d0*d0) >>> 4 & 0xffff) ^ 0xac91`.
  - Regression `src/engine/suntronic/__tests__/sunTronicNoiseOracle.test.ts` +
    golden `sunTronicNoiseOracle.golden.json` (feeds known seed → exact 128B;
    fails-on-revert CONFIRMED). Per-tick seed CARRY stays unverified — affects only
    which noise instance plays, not timbre; does not block audio or the golden.
- Earlier this session (also local/unpushed): `0492ee999` type-2 splice fix +
  `df911c3a4` audition shared-instance fix. Full SunTronic stack `5373b40d1`..HEAD
  is all local/unpushed.

## THE AUTHORITATIVE MECHANISM (from disasm — do not re-derive)

Source: `docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`, routine
`MEGAEFFECTS` @594-763. Read it directly; key facts:

- Pointer setup per voice (A0 = voice, A1 = current record):
  - `A2 = LEA $00A6(A0)` = **voice play buffer** (voice+0xA6). Output dest AND
    feedback source. Fixed per voice, persists across ticks.
  - `A3 = MOVEA.L $001A(A1)` = wave1 (parser `inst.wave1`, record+0x1A).
  - `A4 = MOVEA.L $001E(A1)` = wave2 (parser `inst.wave2`, record+0x1E).
  - `D1 = arpTable[voice+0x12]` (signed), `D4 = byteLen-1`.
- **Feedback latch = bit1 of voice+0x14.**
  - type-1 CALC2: if `D1 != -2` AND bit1 set → `MOVEA.L A2,A3` (source becomes the
    play buffer). CALC4 then `BSET #1` latches. So tick 0 = wave1, tick ≥1 = feedback.
  - type-else CALC13: `MOVEA.L A2,A4`; if bit1 NOT set → `MOVEA.L A3,A4` (wave1).
    CALC15 `BSET #1`. So the A4-source reads = play buffer on tick ≥1, wave1 on tick 0.
    NOTE: CALC14 ALSO streams `(A3)+` = wave1 every sample (separate from A4).
- **type-3 CALC10 is NOT feedback** — reads only `(A3,D4.W)` = wave1.
- **Noise CALC5 is source-independent** (uses RNDNUMBER) — done.
- bit1 is cleared on note-start (GETNEXTNOTE) → feedback restarts from wave1 each note.

### Morph direction — CONFIRMED (was an open worry, now closed)

Measured: mule type-2 real `wave1` (record+0x1A = A3) = `0x7f7f…`; `wave2`
(record+0x1E = A4) = `0x8181…`. Native CALC1 `out = wave1 + (wave2-wave1)*D1/128`
== disasm `A3 + (A4-A3)*D1/128`. No bug. (No type-0 song exists, so this
measurement WAS the oracle check.)

### Splice — locked, ignore the disasm A3/A4 label ambiguity

Committed splice = head from `wave1[0..D1)`, tail from `wave2[D1..]`; reproduces
all 11 mule type-2 buffers byte-exact (golden). Real chip RAM is the arbiter; a
CALC7 A3/A4 reading confusion in the dump does NOT override 11/11 exact. Leave it.

## STRUCTURAL FINDINGS on the feedback capture (this session)

1. **TRIPLE-BUFFERING.** Each channel's AUDxLC rotates through 3 chip-RAM
   addresses 0x80 (128B) apart, e.g. gliders ch0 = {0x26fc4, 0x27044, 0x270c4}.
   MEGAEFFECTS writes voice+0xA6, then the play routine copies to a 3-deep ring and
   re-points Paula (so it never plays a half-written buffer). **Consequence:
   consecutive ticks land at DIFFERENT locs by design.** Any oracle filtering
   "consecutive same-loc" rejects every real feedback step (my first p7 pass did
   exactly this → 0 runs; removing the filter is already done in p7). Exactly 1
   replayer tick per 882-frame chunk (the clean 3-cycle rotation confirms it).
2. **Steady-state convergence.** At a repeating loc the buffer content does NOT
   change (0/55 same-loc steps changed) → the feedback contracts to a FIXED POINT
   B where `B == CALC14(B, wave1, D1)` once the arp D1 is stable.

## THE BLOCKER (exact next task)

`calc14` (faithful transcription living in `tools/suntronic-re/p7-feedback-oracle.ts`)
does NOT yet reproduce the fixed point. First-diff probe gave best ham=122/128 (no
match) — BUT that probe filtered captured buffers by `Set(size)>3`, which catches
the **type-1 NOISE** buffers (gliders has 2 type-1 insts), not smooth feedback
outputs. Smooth type-else outputs are LOW-entropy / adjacent-correlated. So the
comparison was contaminated — calc14 may be closer than it looks, OR still wrong.

### Ordered, crisp resume steps

1. **Isolate smooth buffers.** In the oracle, replace the entropy filter with a
   small max-adjacent-|delta| filter (e.g. reject if any |b[i]-b[i-1]| > threshold)
   to keep ONLY smooth feedback buffers and drop noise. Now you have real
   type-else fixed-point buffers B.
2. **First-diff calc14 vs one smooth B.** Prime suspects in the CALC14 math (p7
   already toggles #1):
   - final `LSR.W #7` is a LOGICAL shift, not arithmetic (p7 tries both `logical`).
   - `MULU #-$4000` (0xC000) then `SWAP` → take the HIGH word of the 32-bit product
     as a signed 16-bit coeff (D3).
   - initial `MOVE.B D0,D1 / SUB.B -1(A4,D4.W),D1 / EXT.W` = sign-extend the BYTE
     difference `(A4[D4]-A4[D4-1]) & 0xff`, then `<<7`.
   - all inner ops are 16-bit `.W` with wrap — watch overflow/sign at each `SWAP`,
     `MULS`, `ADD.W`.
   Dump predicted vs actual per byte until calc14(B,wave1,D1)==B for the true B.
3. **Also verify type-1 CALC3 feedback** (simpler): `D3 = source[D4]`,
   `D0 = 0x80 - D1`, loop `D2 = source[i]; step = ((D2-D3)*D0)>>7; D3 += step;
   out = D3`. Source = play buffer when latched, wave1 on tick 0. Same fixed-point
   test against gliders type-1 pulse (d1 != -1, != -2) buffers.
4. **Port into `SunSynthVoiceState`** (`src/engine/suntronic/SunTronicSynthVoice.ts`):
   - Add `playBuffer: Int8Array` (= voice+0xA6). On note-start it's unset/zeros and
     `feedbackLatched=false` → tick 0 reads wave1; each tick copy `out` into
     `playBuffer` and set `feedbackLatched=true`.
   - `renderType1` CALC3 path: when latched read source from `playBuffer`, else wave1.
   - `renderSmooth` (CALC14): when latched, the A4 seed reads (`src[last]`,
     `src[last-1]`) come from `playBuffer`; the `(A3)+` stream stays wave1.
   - Replace the current `renderSmooth` math with the corrected `calc14` from step 2.
5. **Lock a wasm-free golden** — ordered per-tick sequence (a few ticks incl the
   transient from note-start, not just the fixed point) captured from UADE, asserted
   in the `src/engine/suntronic/__tests__/` test:ci glob, fails-on-revert. Model it
   on `sunTronicNoiseOracle.test.ts` (feed a known start state, assert exact bytes).
6. Re-run `npx tsx tools/suntronic-re/p7-feedback-oracle.ts gliders.src` → expect a
   long feedback run + `FEEDBACK RECURRENCE CONFIRMED`. Then p5 match on gliders
   should jump from 1/340 toward the type-else buffer count. **Closes Gate 1.**

## Critical files

- `src/engine/suntronic/SunTronicSynthVoice.ts` — the native MEGAEFFECTS port.
  - `renderSynthTick` (@69) dispatch; `renderType1` (@131, noise fixed, CALC3
    feedback TODO); `renderType3` (@174, resample, not feedback); `renderSmooth`
    (@202, CALC14, needs feedback + math fix).
  - `SunSynthVoiceState` (@39) — add `playBuffer` here.
- `src/lib/import/formats/SunTronicV13.ts` — `parseSunTronicV13Score(buf).synthInstruments`;
  `wave1Off = record+0x1a` (@489), `wave2Off = record+0x1e` (@490).
- `tools/suntronic-re/p5-wavebuffer-oracle.ts` — Set-dedup match oracle (per-type %).
  `npx tsx …/p5-wavebuffer-oracle.ts [module.src]`. P5_DEBUG / P5_FULL64 env dumps.
- `tools/suntronic-re/p7-feedback-oracle.ts` — ordered per-tick oracle + `calc14`
  transcription + fixed-point search. THE file to iterate for the feedback fix.
  (Untracked; leave untracked like the other RE probes, or commit when it lands a fix.)
- `tools/suntronic-re/suntronicLib.ts` — `CORPUS_DIR`, `addCompanions`,
  `loadInstrCompanions` (loads the .instr companion files UADE needs).
- `tools/uade-audit/uadeRenderCore.ts` — `loadUADEModule`; load flow at :147-207.
- Tests (all in `src/engine/suntronic/__tests__/`, wasm-free, in test:ci glob):
  `sunTronicSynthVoice.test.ts`, `sunTronicWaveBufferOracle.test.ts` (+golden),
  `sunTronicNoiseOracle.test.ts` (+golden).
- Disasm: `docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s` (MEGAEFFECTS
  @594-763; EFFECTS/pitch @415-496 = Gate 2).
- Corpus: `public/data/songs/formats/SUNTronicTunes/`. Pilots: **mule.src** (types
  1,2 only — noise+splice), **gliders.src** (types 1,2,4,5,6 — the feedback song).

## Oracle mechanics (UADE-WASM) — gotchas that cost time

- Paula log ABI: `get_paula_log(out, maxEntries)` drains ≤maxEntries; each entry =
  3×u32: `[0]=(ch<<24)|(reg<<16)|value` (reg 0=LCH 1=LCL 2=LEN 3=PER 4=VOL 5=DAT),
  `[1]=src_addr`, `[2]=tick`. Ring = 512 → DRAIN PER RENDER CHUNK or it overwrites.
- 882 frames = one PAL vblank = exactly ONE replayer tick (confirmed via loc rotation).
- The synth voice REWRITES the play buffer every tick → snapshot per tick, never once.
- `read_memory(addr, out, len)`: malloc out, read, `.slice()` (copy off the heap),
  free. `loc = (LCH<<16)|LCL` (track LCH then combine on LCL). `len` is WORDS → ×2 bytes.
- Load flow: malloc data + `stringToUTF8` filename hint; `_uade_wasm_stop() /
  set_looping(0) / set_one_subsong(1) / load(ptr,len,hintPtr)`; then
  `enable_paula_log(1)`; render loop; `cleanup()` in finally.
- tsx scripts: put them under `tools/suntronic-re/` (project ESM, top-level await OK)
  and use ABSOLUTE imports; `/tmp` scripts fail ("cjs output format" / module resolution).

## House rules in force (SunTronic-specific)

- Root-cause only; every fix ships a fails-on-revert regression wired into test:ci.
- Wasm-free golden tests committed (CI has no UADE-WASM); capture goldens from the
  oracle once, assert against them.
- Never push without explicit user auth (ALL SunTronic commits are local/unpushed).
- Never `git add -A`; add named files. No emojis anywhere.
- Debug audio in real Chrome via MCP, never Playwright; always `stop` +
  `release_all_notes` after any MCP playback test.
- Measure-first: build the smallest probe that discriminates before editing.

## One-line status

Noise fixed+committed (`3b3a2e95b`); morph/splice/noise DONE; **feedback (CALC3 +
CALC14) is the sole Gate-1 gap** — p7 ordered oracle built, triple-buffering +
fixed-point convergence understood, next step is isolate-smooth-buffers →
first-diff calc14 → port `playBuffer` feedback → golden → Gate 1 closes.
