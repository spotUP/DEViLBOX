---
date: 2026-07-14
topic: suntronic-gate2-note-row-timing
tags: [suntronic, uade, native-synth, gate2, note-timing, EFFECTS, GETNEXTNOTE, oracle]
status: draft
---

# SunTronic native engine — Gate 2 research: note-row timing + period pipeline

Phase-1 (research) artifact. Gate 1 (timbre generation, all CALCn synth types) is
CLOSED (see `handoffs/2026-07-13_suntronic-feedback-gate1.md`). Gate 2 proves the
native engine advances the note stream and computes per-tick pitch/period
byte-exactly vs UADE, so a native song plays without UADE.

**All line refs are `docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`.**
CRITICAL CAVEAT (Gate-1 lesson): the LOADED replayer UADE runs is an OPTIMIZED
variant that does NOT match this `.s` line-for-line (CALC dispatch is a jump
table; CALC3 lives at loaded 0x26cc0, not the `.s` CALC3 structure). The `.s` is
authoritative for *intent and data format*; the LOADED disasm is authoritative
for *exact math*. Every Gate-2 formula must be re-confirmed against a
PC-capture of the loaded code before it's trusted, exactly as CALC14/CALC3 were.

## Two subsystems Gate 2 must reproduce

### 1. EFFECTS @415-496 — per-tick, per-voice period + modulation

Runs once per voice per replayer tick (1 PAL vblank). Voice record = A0.
Produces the Paula period at `$0020(A0)` and advances all per-tick state:

- `$0014` voice-active flags (bit7 = inactive/skip; bit1 = feedback latch).
- Volume: `$0015 = ($0C volume × instr[$00C]) >> 7` (@421-426). Volume envelope
  advances `$0C` by signed `$0D` step, clamped [0,0x80] (@468-481).
- Pitch pipeline (@427-460), the CORE Gate-2 target:
  - `D5 = ($0E<<4) + $0F` — wavetable index (instr $0E hi, $0F lo phase).
  - `D0 = $8` (freq accumulator, 16-bit; hi byte = note, lo = fractional slide).
  - vibrato: `D3 = $22`; if <0 negate; `D3 -= 0x4000`; `D3 = (D3 × instr[$24]) >> 12`;
    `D0 += D3` (@437-447).
  - `D1 = (D0>>8) - drin[D5]` → PERIODS table index (@449-451, `<<1` for word).
  - `D3 = PERIODS[D1]`; if `D0&0xFF != 0` lerp toward `PERIODS[D1+1]` by the low
    byte (@452-459) → **fractional-period interpolation**. Result → `$0020`.
  - freq slide: `$8 += $0A`; wrap into [0,0x4800) (@461-467).
- vibrato phase advance: `$22 += instr[$10]`; `$24++`; wrap at instr[$0C]/$0E
  (@489-495). Wave-pos `$10++`; wrap to instr[6] at instr[4] (@484-488).

Tables referenced: `PERIODS` (pc-rel @427), `drin` (@428), both in the replayer
blob — must be read from loaded chip RAM, not assumed.

### 2. GETNEXTNOTE @498-592 — note-stream (row) decode

Per voice, `(A0)` = current stream cursor, `4(A0)` = current instrument ptr.
Reads opcode bytes until a pitch/note byte, mutating voice state. Opcode map
(D0 = signed byte read via `MOVE.B (A1)+,D0`):

| byte | @line | action |
|------|-------|--------|
| `0x00` | 591 GNN1 | end: store cursor to `(A0)`, RTS (stream boundary) |
| `> 0` | 543 GNN2 | note-on. bit6 set → instr-type-A (`tab`, `dx` stride, @545-566); bit6 clear → GNN8 instr-type-B (`inst2`, 0x1C stride, @568-582). Resets $0E/$12/$22, sets $0014, seeds feedback wave ptrs $16/$1A/$1C/$1E |
| `-72..-1` | 584 GNN3 | PITCH: `NOT.B D0; D0 -= $12E(transpose); $8 = D0<<8; $A = 0` — sets note into freq accumulator |
| `-0x64` | 506 | set instr field `$0E`, clr `$0F` |
| `-0x65` | 512 | set freq-slide word `$0A` (2 bytes BE) |
| `-0x66` | 521 | set volume-slide `$0D` |
| `-0x67` | 526 | set volume `$0C = byte<<1`, clr `$0D` |
| `-0x68` | 534 | set global `flg3` |
| `-0x69` | 537 | set global `rndnum` PRNG seed (2 bytes BE) |

Note: control opcodes fall through (`BRA GNN0`) to keep reading; only a PITCH
byte or note-on sets audible state, and `0x00` ends the row-batch.

## The OPEN question — where is row *duration*?

GETNEXTNOTE has NO explicit "wait N ticks" opcode. So per-row timing must live in
the CALLER: a main tick routine that (a) runs EFFECTS every tick and (b) calls
GETNEXTNOTE only when a per-voice duration counter expires. The duration source
is unidentified — candidates: a byte consumed by the note-on path not yet traced,
a global speed at a fixed voice offset, or the `0x00` boundary meaning "1 row
consumed, advance next tick". **This is the first thing the Gate-2 oracle must
measure** — do NOT guess it.

## Oracle plan (measure-first, mirrors Gate 1)

1. **Period oracle**: PC-capture the loaded EFFECTS store to `$0020(A0)` — find
   the loaded store PC by disassembling the loaded EFFECTS (dump via the p8a
   pattern over the loaded EFFECTS address range; the `.s` line is only a guide).
   Capture `$0020` per voice per tick for a known module → golden period timeline.
2. **Note-event oracle**: PC-capture the loaded GETNEXTNOTE cursor advance
   (`MOVE.L A1,(A0)` boundary) to log, per tick, which voices consumed a row and
   the resulting `$8`/`$0C`/`$0E`. → golden note-event timeline = the row clock.
3. Diff the native engine's period + note-event timelines against these goldens,
   wasm-free golden JSON committed + wired into test:ci (CALC14/CALC3 precedent).

## Reuse
- Capture ABI: `uade_wasm_arm_capture_pc(lo,hi)` + `uade_wasm_get_capture` +
  `uade_wasm_read_memory` (entry.c, local). REMEMBER: get_capture returns only
  the FIRST in-window PC per 882-frame render chunk — window each probe on the
  single target store, and accumulate across ticks.
- Corpus + companion loader: `tools/suntronic-re/suntronicLib.ts`.
- capstone M68K `CS_MODE_BIG_ENDIAN|CS_MODE_M68K_040`.
- Loaded MEGAEFFECTS/EFFECTS window is near 0x26c00-0x26e40 (Gate-1 dumps).

## UPDATE 2026-07-14 — period oracle BUILT + working (`tools/suntronic-re/p9a-period-oracle.ts`)

Loaded-code addresses confirmed by disasm + PC-capture of gliders.src:
- The `.s`-shaped EFFECTS copy at 0x2680c-0x26896 is DEAD/relocated — never
  executes (p8e histogram of 0x26000-0x27400 shows it absent). The LIVE per-tick
  handler starts at **0x2660e** (fires 101/150 chunks, the earliest PC each tick).
- Live period→Paula write: `0x26752 move.w $20(a0),$6(a1)` (A1=0xdff0e0 Paula).
- **Voice records: voice[0] = 0x26f8a, stride 0x1ba** (captured A0 at 0x2660e,
  D7=3 = 4-voice loop start). bases = 0x26f8a / 0x27144 / 0x272fe / 0x274b8.
- Voice-record offsets unchanged from `.s`: $08 freq-acc, $0C volume, $14 flags
  (bit0=active, 0xff=inactive), $20 Paula period.

p9a reads $20/$08/$0C/$14 for all 4 voices after each 882-frame tick (no
compute-store capture needed). Validated on gliders — output is clean and
interpretable: vibrato = period oscillation (v0 ±5 around 253), volume envelope =
v decay (40→20→10→…), and NOTE-ON TIMING is directly visible (voice2 activates
t7, voice3 t13; flags flip ff→01 and acc loads the new pitch). **This empirically
answers the open row-duration question** — inter-note tick spacing is now
measurable per voice.

## UPDATE 2026-07-14b — FULL live tick-handler decoded (disasm, gliders.src)

The `.s`-shaped EFFECTS at 0x267f6-0x26928 is NOT dead — it is `bsr`'d per voice
(from 0x266ce) and flows through 0x2680c-0x26896; it just never appears in a
first-hit histogram because 0x2660e always precedes it in the chunk. All
addresses below are LIVE + disasm-authoritative (same basis as CALC14/CALC3).

**Live per-tick handler @0x2660e (RTS 0x266f6):**
- 0x2660e-0x2663e: GLOBAL master-volume fade. `$a8a` = fade speed (0=off),
  `$a8b` counter reload `$a8c`, `$a8d` = master level, stepped by `$a8a`, clamped
  to 0x40. `$a8d` feeds the EFFECTS volume scaling. (`$a8e` = a second master
  scale word at a6+0xa8e.)
- Voice[0] = `lea $aae(a6),a0`; stride 0x1ba; `moveq #3,d7` (4 voices).
- Per-voice seq/tempo loop 0x26668-0x266d6:
  - `cmpi.b #$fe,$14(a0); beq next` — 0xfe = DMA-off/idle, skip voice.
  - tempo = 2-level counter: `$2c++`; if `$2c==$30` reset + `$2d++`; if
    `$2d==$31` reset + `$2e++` (0x2667a-0x2669e). `$2e` = ROW/sequence index.
  - seq table `A1 = $aaa(a6)`; entry = `A1 + $2e*0x14` (20-byte entries).
    `d1 = 3 - d7` = channel index. `tst.l (a1)`: 0 → clear voice; <0 → note-off
    (writes DMACON `$dff096` + `$dff0a8`, sets `$14=0xfe`); >0 → live row:
    `$23(a0) = seqEntry[$10 + d1]` (SYNTH TYPE per channel), and
    `$0(a0) = seqEntry[d1*4]` (NOTE-STREAM ptr per channel).
  - `bsr $2692a` = GETNEXTNOTE (decode note stream into voice state).
  - `bsr $267f6` = EFFECTS (compute `$15` volume + `$20` period, advance state).
- Paula-write loop 0x2673c-0x26776: `$38` gate → `$15`→AUDxVOL `$9(a1)`;
  `$39` gate → `$20`→AUDxPER `$6(a1)` (a1 = `$dff0a0`). `$38/$39` = per-voice mute.
- DMACON/audio-enable bookkeeping, then `bsr $26be4` (MEGAEFFECTS wave-gen).

**EFFECTS @0x267f6 (period + volume), inputs A0=voice, A1=instr=$4(a0):**
- guard: `$14<0` → return; `$37(a0)==1` → skip vol+period (jump 0x2689a).
- VOLUME `$15`: `env = instrEnvTable[$10]` (A2=`$0(a1)`); `d1 = env*$c >> 6`;
  `d1 = d1*$a8d >> 6`; `d1 = d1*$a8e(a6) >> 6`; `$15 = d1.b`. (The two extra
  master-scale mulu/lsr#6 are LOADED-ONLY, absent from the `.s`.)
- PERIOD `$20` (0x26850-0x26896): `d5 = ($e<<4)+$f` (drin index);
  `d0 = $8` (u16 acc); vib: `d2 = instrVibTable[$26]` (A4=`$8(a1)`, zero-ext byte);
  `d3 = |$24| - 0x4000`; `d3 = (d3*d2)>>12` (muls.w; lsl.l#4; swap);
  `d0 += d3`; `note = ((d0>>8) - drin[d5]) & 0xff`; `p = PERIODS[note]`
  (A2=`$11ae(a6)` words); if `d0&0xff`: `p += ((PERIODS[note+1]-p)&0xffff *
  (d0&0xff))>>8`; `$20 = p`.
- freq slide: `$8 += $a`; wrap into [0,0x4800). vol-env: gated by `$33` counter
  (reload `$32`), `$c += $d`, clamp [0,0x40]. wave-pos: `$f=($f+1)&0xf`;
  `$10++`; if `$10==instr[$4]` → `$10=instr[$6]` (wave loop). vib phase:
  `$24 += instr[$10]`; `$26++`; if `$26==instr[$c]` → `$26=instr[$e]`.

Tables: PERIODS = a6+0x11ae (256 words); drin = abs 0x2828b (256 bytes, pc-rel
`lea (d16,pc),a3` @0x2683c, disp 6733). Both read live from chip RAM.

**GETNEXTNOTE = 0x2692a** (row opcode decode — see the `.s` @498-592 opcode map
above; re-confirm the loaded variant when porting).

Standalone period-formula probe (p9b) was ABANDONED: the period store 0x26896
cannot be PC-captured (first-hit-per-chunk lands on 0x2660e; register snapshots
at the reachable 0x266ce don't hold period internals; post-render memory reads
see advanced inputs). Not needed — the p9a OUTPUT timeline ($20/$8/$c/$14 per
tick) is the golden, and the native port is validated by diffing its timeline
against p9a, which is the real end-to-end check. The formula above is
disasm-authoritative (same basis as CALC3).

## UPDATE 2026-07-14c — LOADED GETNEXTNOTE @0x2692a disassembled (authoritative)

Dumped loaded 0x26900-0x26be0 (p8a) + capstone. Full decode below. Corrects the
`.s`-derived opcode map in several places — the `.s` was NOT line-for-line.

**Dispatch @0x2692a** (`a1 = $0(a0)` note-stream cursor; `d0 = (a1)+` byte):
- `d0 == 0x00` → `$0(a0) = a1; rts` (END — store cursor, stop decode this tick).
- `d0 > 0` (bpl) @0x26976 → `$22(a0) = d0; loop` (STAGE note/instr-select byte,
  keep reading — the note-on trigger fires later from a PITCH opcode).
- `0xb8 <= d0 <= 0xff` (`cmpi.b #$b8; bpl`) → PITCH @0x2697c.
- `0x80 <= d0 <= 0xb7` → jump table: `neg.b; addi.b #$9c; lsl.b #1` → word index
  into 6-entry table @0x2694c (`movea.w (pc,d0.w); adda.l a6; jmp`). Only opcodes
  `-0x64..-0x69` produce valid even indices 0..10; targets = `a6 + tableWord`
  (a6-relative CODE): 0x0586/0x059e/0x05b8/0x05c4/0x05d0/0x05ea.

**PITCH @0x2697c** (opcode 0xb8..0xff = -72..-1):
```
tst.w $34(a0); bne loop          ; $34!=0 (mute/tie) → skip, re-read
not.b d0
sub.b $23(a0), d0                ; $23 = PER-CHANNEL TRANSPOSE (loaded uses $23, .s said $12E)
move.b d0,$8(a0); clr.b $9(a0)   ; $8 hi byte = pitch; $8 = pitch<<8
clr.w $a(a0)                     ; clear freq-slide
tst.b (a1); bmi/beq skipStage    ; if next byte >0 → $22(a0)=(a1)+ (stage instr)
move.b $22(a0),d0; beq loop      ; no staged instr → loop
clr.b $37(a0)
bclr #6,d0; beq typeB(0x26a16)   ; bit6 SET → type-A fallthrough; clear → type-B
```
IMPORTANT: `$23` is a per-channel TRANSPOSE, not synthType. Seq entry (20 bytes)
= 4×u32 note-stream ptrs (offset 0x0,0x4,0x8,0xc) + 4 transpose bytes
(0x10,0x11,0x12,0x13); GETNEXTNOTE reads `$23(a0)` which the tick handler set to
`seqEntry[0x10 + chan]`. Synth type comes from the INSTRUMENT record ($4 ptr).

**Type-A note-on @0x269ae** (bit6 of $22 was set; d0 = $22 with bit6 cleared):
```
a3 = 0x27732 + d0*0x24            ; instr table A (abs), stride 36
$4(a0) = a3
clr.b $e; clr.b $f; clr.w $10; clr.w $12; clr.w $24; clr.w $26
$14(a0) = 1                      ; ACTIVE
a4 = $3a(a0) + $a70(a6); $16(a0) = a4   ; sample/wave buffer ptr
clr.w $1a; $1b(a0)=instr[$22]; clr.w $1c; clr.b $1e; $1f(a0)=instr[$22]
clr.w $2a; $28(a0)=instr[$21]; clr.b $29
loop
```
**Type-B note-on @0x26a16** (bit6 clear):
```
subq.b #1,d0                     ; index = $22 - 1
a3 = 0x27996 + d0*0x1c           ; instr table B (abs), stride 28
$4(a0)=a3; clr.b $e; clr.b $f; clr.w $10
$14(a0) = 0 (clr.b!)             ; NOTE: type-B clears active flag, does NOT set 1
clr.w $24; clr.w $26
a4 = $12(a3); $16(a0)=a4         ; sample ptr from instr[$12]
$1a(a0)=instr[$16]; $1c(a0)=instr[$18]; $1e(a0)=instr[$1a]
loop
```

**Control opcodes** (jump-table targets, all `bra loop` after):
- `-0x64` @a6+0x586 (0x26a62): if `$34!=0` skip+`addq #1,a1`; else `$e(a0)=(a1)+;
  clr.b $f` (set wavetable-pos hi, clear lo).
- `-0x65` @0x26a7a: freq-slide word. if `$34!=0` skip+`addq #2`; else
  `$a(a0) = (a1)+<<8 | (a1)+`.
- `-0x66` @0x26a94: `$d(a0)=(a1)+` (vol-slide step); `$32(a0)=(a1)+` (env reload).
- `-0x67` @0x26aa0: `$c(a0)=(a1)+` (voice VOLUME, **NO <<1** — .s was wrong);
  `clr.b $d` (clear vol-slide).
- `-0x68` @0x26aac: `d0=(a1)+`; write d0 to `$30` of ALL 4 voices
  (`$aae(a6)+0x30`, +0x1ea, +0x3a4, +0x55e = stride 0x1ba) = GLOBAL TEMPO set
  (`.s` mislabeled "flg3").
- `-0x69` @0x26ac6: `d1=(a1)+<<8|(a1)+`; `$a98(a6)=d1`; `$a9a(a6)=d1 ^ 0x7e28`
  (PRNG seed pair).

Also present (unreachable from this table but in range): 0x26adc clears $10 if
$34==0, 0x26aec clears $12 if $34==0 — likely other opcode handlers.

## Next step
1. Emit the p9a timeline as a committed wasm-free golden JSON over 2-3 modules
   (mirror `sunTronicSmoothOracle.golden.json`), covering note-on ticks + a run
   of vibrato/envelope ticks. Wire into test:ci, fails-on-revert.
2. Port the EFFECTS period pipeline (0x26850-0x26896: freq-acc + vibrato `>>12` +
   PERIODS-table fractional interpolation via drin index) and GETNEXTNOTE row
   decode into the native engine; diff its period+note-event timeline vs golden.
   NOTE the loaded volume path adds master-volume scaling (globals $a8d/$a8e(a6),
   two extra mulu/lsr#6) NOT in the `.s` — confirm against the oracle vol column.
3. Then Phase 4 native song playback (GATED until the period+note timelines match).
