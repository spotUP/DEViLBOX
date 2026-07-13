---
date: 2026-07-14
topic: suntronic-gate2-native-port
tags: [suntronic, uade, native-engine, gate2, reverse-engineering, handoff]
status: draft
---

# SunTronic V1.3 — Gate 2 native port (fresh-start handoff)

Entry point for the next session. Gate 1 (all synth timbre types) and the Gate 2
DISASSEMBLY are DONE. This session's job = write the native replayer driver
(note-row timing + period pipeline) and lock it byte-exact against a committed
golden. All work below is LOCAL/unpushed. Do NOT push without explicit user auth.

## The campaign (why this exists)

Standing `/loop`: "make compiled-68k UADE players natively editable so people can
author NEW songs with these engines." SunTronic V1.3 is the PILOT — prove ONE
format end-to-end (native synthesis byte-exact vs UADE) before ~20 others.

Phase gates (do NOT skip):
- **Gate 1** = timbre generator (MEGAEFFECTS, all CALCn synth types). **CLOSED.**
- **Gate 2** = note-row timing + period pipeline (EFFECTS + GETNEXTNOTE).
  Disassembly DONE; **native port = this session.**
- **Phase 4** = native song playback with NO UADE. GATED until Gate 2's period +
  note timelines match the golden.

## Current state

### Gate 1 — CLOSED (all local/unpushed)
All synth types byte-exact vs UADE, golden-locked in test:ci:
- CALC1 morph, CALC2 pulse/noise, CALC7 splice — done earlier.
- CALC13/14 smooth feedback — commit `ad4c13150`, golden `sunTronicSmoothOracle`.
- CALC3 type-1 pulse — commit `955292810`, disasm-confirmed vs LOADED
  0x26cc0-0x26ce0 (no golden; corpus barely runs the pulse path, PC-capture ABI
  can't sample the loop body — same ground truth as CALC14).
Engine: `src/engine/suntronic/SunTronicSynthVoice.ts`.

### Gate 2 — DISASSEMBLED (this session, commits d66d6e00c / 56e2f0c2e / 777eaf0f7)
Full LIVE decode in `thoughts/shared/research/2026-07-14_suntronic-gate2-note-timing.md`.
Read that doc FIRST — it has the complete formulas. Summary below.

## CRITICAL lesson (Gate-1, still binding)

**The replayer UADE runs is an OPTIMIZED/RELOCATED variant that does NOT match
DP_Suntronic.s line-for-line.** The `.s` is authoritative for INTENT + data
format; the LOADED disassembly is authoritative for EXACT math. Every formula
must be re-confirmed vs a PC-capture / dump of the loaded code. GETNEXTNOTE has
NOT yet been disassembled from the loaded binary — only the `.s` opcode map is
known. **Disassemble loaded 0x2692a before trusting the `.s` GETNEXTNOTE.**

## LIVE Gate-2 machinery (disasm-authoritative, gliders.src)

All addresses live + confirmed. A6 = replayer state base (=0x264dc for gliders,
but capture it per-run, do NOT hardcode).

### Tick handler @0x2660e (RTS 0x266f6)
- 0x2660e-0x2663e: GLOBAL master-volume fade. `$a8a`=fade speed (0=off),
  `$a8b` counter reload `$a8c`, `$a8d`=master level (clamp 0x40), `$a8e`=2nd scale.
- Voice[0] = `lea $aae(a6),a0`; stride **0x1ba**; `moveq #3,d7` → 4 voices.
- Per-voice seq/tempo loop 0x26668-0x266d6:
  - `cmpi.b #$fe,$14(a0); beq next` — 0xfe = DMA-off/idle, skip.
  - tempo = 2-level counter: `$2c++`; if `$2c==$30` reset + `$2d++`; if
    `$2d==$31` reset + `$2e++`. **`$2e` = ROW / sequence index.**
  - seq table `a1 = $aaa(a6)`; entry = `a1 + $2e*0x14` (20-byte entries).
    `d1 = 3 - d7` = channel index. `tst.l (a1)`: 0→clear voice; <0→note-off
    (DMACON $dff096 + $dff0a8, set `$14=0xfe`); >0→live row:
    `$23(a0) = seqEntry[$10 + d1]` (SYNTH TYPE per channel),
    `$0(a0) = seqEntry[d1*4]` (NOTE-STREAM pointer per channel).
  - `bsr $2692a` = GETNEXTNOTE (decode note stream into voice state).
  - `bsr $267f6` = EFFECTS (compute `$15` vol + `$20` period, advance state).
- Paula-write loop 0x2673c-0x26776: `$38` gate → `$15`→AUDxVOL `$9(a1)`;
  `$39` gate → `$20`→AUDxPER `$6(a1)` (a1=$dff0a0). `$38/$39` = per-voice mute.
- then `bsr $26be4` (MEGAEFFECTS wave-gen = Gate-1 code, already ported).

### EFFECTS @0x267f6 (inputs A0=voice, A1=instr=$4(a0))
Guard: `$14<0`→return; `$37(a0)==1`→skip vol+period (jump 0x2689a).
- VOLUME `$15`: env=instrEnv[$10] (a2=$0(a1)); `d1=env*$c>>6`; `d1=d1*$a8d>>6`;
  `d1=d1*$a8e(a6)>>6`; `$15=d1.b`. **The two master-scale multiplies are
  LOADED-ONLY (absent from .s).**
- PERIOD `$20` (0x26850-0x26896):
  ```
  d5 = ($e<<4)+$f                         ; drin index (wavetable pos)
  d0 = $8 (u16 freq acc)
  d2 = instrVibTable[$26]  (a4=$8(a1), byte)   ; VERIFY zero- vs sign-ext in loaded
  d3 = |$24| - 0x4000
  d3 = (d3 * d2) >> 12                     ; muls.w; lsl.l#4; swap
  d0 = (d0 + d3) & 0xffff
  note = ((d0>>8) - drin[d5]) & 0xff       ; sub.b
  p = PERIODS[note]                        ; a2=$11ae(a6), words
  if (d0 & 0xff): p += ((PERIODS[note+1]-p)&0xffff * (d0&0xff)) >> 8
  $20 = p
  ```
- freq slide `$8 += $a` wrap [0,0x4800). vol-env: gated by `$33` counter
  (reload `$32`), `$c += $d`, clamp [0,0x40]. wave-pos `$f=($f+1)&0xf; $10++;
  if $10==instr[$4] → $10=instr[$6]`. vib phase `$24 += instr[$10]; $26++;
  if $26==instr[$c] → $26=instr[$e]`.

Tables: PERIODS=a6+0x11ae (256 words); drin=abs **0x2828b** (256 bytes, pc-rel
`lea (d16,pc),a3` @0x2683c disp 6733). Read both live from chip RAM.

### GETNEXTNOTE @0x2692a — NOT YET LOADED-DISASSEMBLED
`.s` opcode map (@498-592, re-confirm vs loaded): opcode byte from note-stream ptr:
- `0x00` = end / store cursor
- `>0` = note-on (bit6 set → instr-type-A tab/dx stride; bit6 clear → type-B
  inst2/0x1C stride)
- `-72..-1` = PITCH: `NOT.B; SUB $12E transpose; $8 = D0<<8`
- `-0x64` = set `$0E`; `-0x65` = freq-slide `$0A` word; `-0x66` = vol-slide `$0D`;
  `-0x67` = volume `$0C = byte<<1`; `-0x68` = flg3; `-0x69` = rndnum PRNG seed.

## Voice-record layout (offsets from voice base, stride 0x1ba)
`$00` note-stream ptr · `$04` instr ptr · `$08` u16 freq acc (hi byte=pitch) ·
`$0A` freq-slide word · `$0C` voice vol · `$0D` vol-slide step · `$0E/$0F`
wavetable pos · `$10` wave-pos idx · `$14` flags (0x01 active / 0xff inactive /
0xfe DMA-off) · `$15` final Paula vol · `$20` Paula period · `$22/$24/$26`
vibrato phase/depth/index · `$23` synthType · `$2c/$2d/$2e` tempo counters ·
`$30/$31` tempo limits · `$33/$32` env counter · `$37` synth-flag · `$38/$39`
mute flags.

## Existing native engine (already written, may need reconciling with LIVE)
- `src/engine/suntronic/SunTronicEffects.ts` — EFFECTS port from the `.s`.
  `stepEffects(inst, state, drin)` → `{period, volume}`. Period/vibrato path
  looks structurally aligned with LIVE. **KNOWN divergence flagged in-file
  (commit 56e2f0c2e):** volume path is `.s`'s `env*vol>>7`, LIVE is
  `env*vol>>6` + two master-scale multiplies. Only affects final Paula `$15`,
  NOT the p9a golden (which reads voice-vol `$0c`). Fix for real audio in Phase 4.
  Also VERIFY vibrato byte sign- vs zero-extension against loaded.
- `src/engine/suntronic/SunTronicSynth.ts`, `SunTronicVoiceRenderer.ts`,
  `SunTronicSynthVoice.ts` — Gate-1 timbre + voice glue.
- Tests + goldens in `src/engine/suntronic/__tests__/` (config, effects,
  synthVoice, voiceRenderer, + noise/waveBuffer/smooth oracle goldens).

## The oracle (Gate-2 golden source)
`tools/suntronic-re/p9a-period-oracle.ts` (commit 2c3799495). Reads each voice's
`$20`(period) `$08`(acc) `$0c`(vol) `$14`(flags) directly from loaded voice
records after every 882-frame render tick (1 PAL vblank = 1 replayer tick).
Sidesteps the first-hit-per-chunk PC-capture limit: only ONE PC capture needed
(voice[0] base = min A0 at PC 0x2660e), then plain memory reads. WORKS on
gliders — output shows note-on timing (voice2@t7, voice3@t13), vibrato, vol env.

Run: `npx tsx tools/suntronic-re/p9a-period-oracle.ts gliders.src 48`

**p9b (standalone period-formula probe) was ABANDONED + deleted.** Period store
0x26896 is uncapturable by the PC-capture ABI (first-hit-per-chunk lands on
0x2660e; regs at the reachable 0x266ce lack period internals; post-render reads
see advanced inputs). Not needed — p9a output timeline IS the golden; the native
driver diffs against it. The formula is disasm-authoritative (same basis as CALC3).

## NEXT STEPS (this session)

1. **Disassemble LOADED GETNEXTNOTE @0x2692a.** Use `p8a-dump-calc3-bin.ts` with
   a window over 0x2692a (e.g. `npx tsx tools/suntronic-re/p8a-dump-calc3-bin.ts
   gliders.src 0x26900 0x26be0` → `scratch-calc3.bin`), then capstone
   (M68K BIG_ENDIAN|040, python3.11 at
   `/opt/homebrew/opt/python@3.11/bin/python3.11`). Confirm the opcode map + the
   note-on instr-stride math vs the `.s`. Resync capstone on decode failure
   (advance 2 bytes).
2. **Port GETNEXTNOTE + the song tick loop** into a new native driver (e.g.
   `SunTronicPlayer.ts`): 4 voices, 2-level tempo counter, seq-table dispatch
   (synthType `$23`, note-stream ptr `$0`), calling `stepEffects` per voice per
   tick. Feed drin + PERIODS from the parsed module (parser already exists —
   `src/lib/import/formats/SunTronicV13.ts`; locate drin @ its module offset).
3. **Emit p9a timeline as a committed wasm-free golden JSON** (mirror
   `sunTronicSmoothOracle.golden.json`): per-tick per-voice `$20/$08/$0c/$14`
   over 2-3 modules. Wire a test into test:ci that diffs the native driver's
   timeline against the golden. **Do 2+3 together** — the golden needs the native
   driver to diff against, and the test must fail-on-revert.
4. **Phase 4** (GATED until 2+3 match): native song playback, no UADE. Apply the
   `>>6`×3 master-scale volume for real audio.

## Tools + ABI reference
- Corpus + companion loader: `tools/suntronic-re/suntronicLib.ts` (`CORPUS_DIR`,
  `addCompanions`, `loadInstrCompanions`).
- UADE render core: `tools/uade-audit/uadeRenderCore.ts` (`loadUADEModule`).
- Load flow: `_uade_wasm_init(44100)`, `addCompanions`, malloc data + filename
  hint via `stringToUTF8`, `_uade_wasm_stop / set_looping(0) / set_one_subsong(1)
  / load(ptr,len,hintPtr)`, render 882-frame chunks, `cleanup()` in finally.
- Capture ABI: `_uade_wasm_arm_capture_pc(pc_lo, pc_hi)` (fires when
  pc_lo ≤ PC < pc_hi), `_uade_wasm_arm_capture(addr, size)`,
  `_uade_wasm_get_capture(out)` → out[0..7]=D0-D7, [8..15]=A0-A7, [16]=PC,
  [17]=hit addr. **Returns only the FIRST in-window PC hit per 882-frame chunk.**
  `_uade_wasm_read_memory(addr, out, len)` reads CURRENT (post-render) heap.
- tsx scripts live under `tools/suntronic-re/` (project ESM, top-level await OK),
  ABSOLUTE imports. `/tmp` scripts fail (cjs / module resolution).
- Scratch: `scratch-calc3.bin`, `scratch-disasm.txt` are regenerable temps
  (p8a + capstone), NOT committed. p7*/probe-* under tools/suntronic-re/ are
  untracked Gate-1 scratch.

## House rules in force (SunTronic-specific)
- Root-cause only; every fix ships a fails-on-revert regression in test:ci.
- Wasm-free golden tests committed (CI has NO UADE-WASM); capture goldens from
  the oracle once, assert against them.
- **Never push without explicit user auth** (ALL SunTronic commits local/unpushed).
- Never `git add -A`; add named files. No emojis anywhere.
- Debug audio in real Chrome via MCP, never Playwright; `stop` +
  `release_all_notes` after any MCP playback test.
- Measure-first: build the smallest probe that discriminates before editing.
  Never guess constants a probe can read from the real artifact.
- Type-check mandatory: `npm run type-check` (`tsc -b --force`) before done.

## Commit trail (this + prior session, all LOCAL)
- `ad4c13150` CALC14 smooth feedback + golden
- `955292810` CALC3 pulse disasm-confirmed
- `2c3799495` p9a period oracle + research doc
- `0eb31b128` Gate-2 research doc initial
- `d66d6e00c` full LIVE Gate-2 tick-handler decode
- `56e2f0c2e` flag LIVE-vs-.s volume divergence in EFFECTS port
- `777eaf0f7` handoff update (superseded by this file)

## One-line status
Gate 1 CLOSED. Gate 2 fully DECODED (formulas in the research doc, p9a oracle
works). NEXT = disasm loaded GETNEXTNOTE 0x2692a → port note-decode + tick loop
→ emit committed golden + fails-on-revert test → Phase 4 native playback (GATED).
