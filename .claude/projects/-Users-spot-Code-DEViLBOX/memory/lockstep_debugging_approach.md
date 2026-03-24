---
name: lock-step-register-debugging
description: Proven approach for debugging transpiled 68k replayers — compare Paula register writes tick-by-tick instead of WAV files
type: feedback
---

Compare internal state/register writes between UADE and C replayer tick-by-tick. First mismatch reveals the exact bug.

**Why:** WAV comparison is useless for replayer debugging — different Paula implementations (BLEP vs nearest-neighbor) produce uncorrelated waveforms even when the replayer logic is identical. Lock-step register comparison found the Steve Turner envelope timing bug in minutes that WAV comparison couldn't find at all.

**How to apply:**

1. **Decode UADE register writes:** `uade123 --write-audio /tmp/regs.bin` produces binary oscilloscope data. Decode with `steve-turner-wasm/decode_uade_regs.c` (header=16 bytes, frames=12 bytes, MSB of tdelta indicates Paula event vs audio output). Event types: VOL=1, PER=2, DAT=3, LEN=4, LCH=5, LCL=6, LOOP=7.

2. **Log C replayer register writes:** Wrap paula_set_* functions to printf on each call with tick number. See `steve-turner-wasm/test_reglog.c`.

3. **Compare side by side:** First tick where VOL/PER/LEN values diverge reveals the bug. Focus on: which envelope phase runs at which tick, whether function pointer fall-throughs match the ASM, whether init code runs extra processing passes.

**Key patterns found:**
- Extra `process_voices()` in init shifted all envelope timing (Steve Turner)
- ASM fall-through (`lbC0009AA` → `lbC0009CE`) means two phases execute in one tick — C code must replicate this
- UADE's `--write-audio` format: `struct { int32_t tdelta; union { int16_t output[4]; struct { int8_t ch; int8_t type; uint16_t val; } event; } }` — 12 bytes per frame, header 16 bytes
