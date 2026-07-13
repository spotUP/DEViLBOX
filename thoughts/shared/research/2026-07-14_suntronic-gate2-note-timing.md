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

## Next step
Locate the loaded EFFECTS routine + its `$0020` store PC (disasm the loaded blob
around the pitch pipeline), then build the period oracle. That single measurement
also answers the row-duration question (watch which tick GETNEXTNOTE fires).
