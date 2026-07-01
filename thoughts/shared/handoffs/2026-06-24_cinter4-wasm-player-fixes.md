---
date: 2026-06-24
topic: cinter4-wasm-player-fixes
tags: [cinter4, wasm, paula, transpile, 68k, audio]
status: final
---

# Cinter4 WASM player — playback fixes (handoff)

The transpiled Cinter4 WASM player (`cinter4-wasm/`) was producing wrong/short audio,
dropping a voice, and mis-selecting instruments/pitches. The root pattern is a transpiler
that **systematically drops the 68k V (overflow) flag**: six branches read V from a stale
prior op. Plus a Paula latch bug and a dropped loop instruction. All fixes are in two C
files:

- `cinter4-wasm/src/cinter4/cinter4.c`      (the transpiled synth/player)
- `cinter4-wasm/src/cinter4/paula_soft.c`   (the soft-Paula chip emulator)

Apply these three changes to your copies, rebuild (`emmake make`), done. Each was
found by instrumentation (printf), not guessing — evidence below so you can confirm
against your own build.

---

## Fix 1 — Missing V (overflow) flag on two ops in `cinter4.c` (THE main fix)

**Symptom:** synth "sounds wrong" — no saturation, mangled timbre.
**Cause:** the transpiler emitted `ADD.W`/`SUB.W` that set Z and N but **not V**, yet
the next instruction is a `BVC` that depends on V. So the saturation / envelope-clamp
logic read a stale V flag.

These live in `CinterMakeInstruments` (the per-sample synth loop). Two sites:

### 1a. Write-sample `ADD.W D0,D0` (before `BVC .notover`)
The ASM: `add.w d0,d0 ; bvc .notover ; subq.w #1,d0`. Replace the transpiled block with:

```c
{  /* ADD.W	D0,D0 — must set V: the following BVC saturates on signed overflow */
    uint16_t _a  = (uint16_t)W(d0);
    uint16_t _ar = (uint16_t)(_a + _a);
    flag_v = (((_a ^ _ar) >> 15) & 1);  /* signed overflow of a+a */
    W(d0) = (uint16_t)((uint16_t)_ar);
    flag_z = ((int16_t)(_ar) == 0);
    flag_n = ((int16_t)(_ar) < 0);
}
```

### 1b. Attack-decay `SUB.W D1,(A1)` (before `BVC .nottop`)
The ASM: `sub.w d1,(a1) ; bvc .nottop ; move.w #32767,(a1) ...`. Replace with:

```c
{  /* SUB.W	D1,(A1) — must set V for the following BVC (amplitude clamp) */
    uint16_t _a  = (uint16_t)READ16(a1);
    uint16_t _b  = (uint16_t)W(d1);
    uint16_t _sr = (uint16_t)(_a - _b);
    flag_v = ((((_a ^ _b) & (_a ^ _sr)) >> 15) & 1);  /* signed overflow of a-b */
    hw_write16(a1, (uint16_t)_sr);
    flag_z = ((int16_t)(_sr) == 0);
    flag_n = ((int16_t)(_sr) < 0);
}
```

**Overflow formulas:** ADD `a+b` → `V = ((a^result) & (b^result)) >> 15` (for `a+a` it
reduces to `(a^result)>>15`); SUB `a-b` → `V = ((a^b) & (a^result)) >> 15`.

**Evidence:** dump the synthesized instrument PCM (read `c_Instruments` table at
work+156: 32 × [len:replen long, ptr long]; PCM at the ptr) and compare to your
reference synth. Before: ~3–14% sample match. After: 94–99% (avgErr ~0).

> This is a **general transpiler gap** (like the earlier ROL/ROXL-width and ADD→X bugs):
> any `ADD`/`SUB` whose result feeds a `BVC`/`BVS` must compute V. Grep your transpiled
> output for `if (flag_v)` / `flag_n != flag_v` (BVC/BVS/BLT/BGE) and verify the
> preceding arithmetic actually sets `flag_v`.

---

## Fix 2 — `ADD.L D5,A4` truncated to 16-bit in `cinter4.c` (2 sites)

The transpiler wrote a 32-bit `ADD.L` as if it were `.W`:

```c
// BEFORE (both sites — raw-instrument advance, and note-offset advance):
a4 = (uint32_t)((int32_t)a4 + (int32_t)(int16_t)(d5));  /* ADD.L  D5,A4 */
// AFTER:
a4 = (uint32_t)((int32_t)a4 + (int32_t)(d5));           /* ADD.L  D5,A4 (full 32-bit) */
```

Only bites large raw samples / sample-offsets > 16383, but it's a real bug. (Same
class as the `add.l d5,d5` doubling — make sure your instrument-space pointer math is
all 32-bit, not `(int16_t)`.)

---

## Fix 3 — Paula DMA wrap-latch in `paula_soft.c` (THE "notes too short" fix)

**Symptom:** every note plays ~one tick then silence ("bwe" instead of "bweeeee"),
even though the synthesized PCM is long and correct.
**Cause:** Cinter writes the full length on a note, then `AUDxLEN=0` **every following
tick** (the Amiga one-shot idiom — the repeat only takes effect on the next DMA wrap).
The emulator applied `AUDxLC`/`AUDxLEN` writes **immediately**, so length→0 truncated
the current note instantly. Real Paula latches LC/LEN into its internal counters only
on **DMA start** and **sample wrap**.

**Fix:** give each channel register-vs-current state. Writes land in registers; the
playing buffer is latched from them on DMA-enable and on wrap.

Channel struct — add `reg_sample` / `reg_len`:
```c
typedef struct {
    const int8_t* sample;       // currently-playing buffer (latched)
    uint32_t      sample_len;   // bytes
    const int8_t* reg_sample;   // AUDxLC register (latched on DMA start / wrap)
    uint32_t      reg_len;      // AUDxLEN register (bytes)
    float pos, step, volume;
    int   dma_on;
} PaulaChannel;
```

Pointer/length writes set the **register only** (no immediate effect, no pos reset):
```c
void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].reg_sample = data;            // was: s_ch[ch].sample = data; pos = 0;
}
void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].reg_len = (uint32_t)len_words * 2;   // was: s_ch[ch].sample_len = ...
}
```

DMA-enable latches register → current:
```c
if (enable) {
    s_ch[i].dma_on     = 1;
    s_ch[i].sample     = s_ch[i].reg_sample;
    s_ch[i].sample_len = s_ch[i].reg_len;
    s_ch[i].pos        = 0.0f;
}
```

Sample loop wraps by re-latching the register (the repeat); reg_len==0 → stop:
```c
static float sample_channel(PaulaChannel* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        ch->pos       -= (float)ch->sample_len;
        ch->sample     = ch->reg_sample;
        ch->sample_len = ch->reg_len;
        if (!ch->sample || ch->sample_len == 0) { ch->dma_on = 0; return 0.0f; }
        idx = (uint32_t)ch->pos;
        if (idx >= ch->sample_len) { ch->pos = 0.0f; idx = 0; }
    }
    float s = (float)ch->sample[idx] / 128.0f;
    ch->pos += ch->step;
    return s * ch->volume;
}
```

**Evidence:** instrument `paula_set_length` — you'll see `len=full` on the note then
`len=0` on every following tick. Render per-50ms RMS: before = one ~50ms blip then
silence; after = a sustained note + decay.

> This is generic soft-Paula: any replayer using the LC/LEN-then-repeat one-shot idiom
> needs the wrap-latch. Looping samples (reg_len>0, reg points at the repeat) work too.

---

## Fix 4 — Transpiler dropped the 4th `ADDX.W D0,D0` in the DMA-mask loop (one voice silent)

**Symptom:** the song plays but one channel/voice is entirely missing — sounds "flatter",
"many samples missing" vs the reference MOD. Hard to spot because 3 of 4 voices play.
**Cause:** `CinterPlay1` builds the channel-trigger DMA mask with an unrolled `rept 4`:
```asm
moveq.l #0,d0
rept 4
  move.w (a1),d2     ; read this track's current note word
  add.w  d1,a1       ; advance to next track (a1 += TrackSize)
  add.w  d2,d2       ; C/X = bit15 = "note trigger" flag
  addx.w d0,d0       ; shift that bit into the mask
endr
move.w d0,$096(a3)   ; → DMACON
```
The transpiler emitted the read + `ADD.W D1,A1` + `ADD.W D2,D2` for all 4 iterations but
**only 3 of the 4 `ADDX.W D0,D0`** — the 4th was missing. Result: the 4th channel's
trigger bit is never shifted in, AND the mask is under-shifted by one, so the
channel→bit mapping is wrong. One voice never gets DMA-enabled → silent.

**Fix:** add the missing 4th `W(d0) = (uint16_t)(W(d0) + W(d0) + flag_x);` after the 4th
`ADD.W D2,D2` and before the `MOVE.W D0,150(A3)` (DMACON write). In the file there should
be exactly **4** occurrences of that ADDX expression; if `grep -c` shows 3, that's the bug.

**Evidence:** count DMA-enables per Paula channel over a long render. Before: `ch0=0`
(flat, never) while ch1/2/3 ≈ 30 each. After: ch0 climbs (0→3→18…) as its track's notes
come in — all 4 channels active. Decode the `.cinter4` note section independently to prove
all 4 tracks actually contain triggers (tracks stored in file order 3,2,1,0).

> General transpiler gap: any unrolled `rept`/`dbf` loop can lose an instruction at an
> iteration boundary. After transpiling a `rept N` block, count the emitted copies of each
> instruction — they must all equal N.

---

## Fix 5 — FOUR more dropped V flags (note→instrument selection, pitch, sample loop, sine gen)

**Symptom:** specific instruments play the wrong notes / wrong instrument / "don't play"
their part in the song (e.g. JazzCat-Automatic instrument 0x11). Some sounds come out as
beeps. Most of the song is fine — only notes whose arithmetic *overflows* are affected.
**Cause:** the transpiler systematically omits the V (overflow) flag. Fix 1 caught two
sites in the synth; a full audit of every `BGE/BLT/BGT/BLE/BVC/BVS` consumer found **four
more**, each reading V from a stale prior op:

| C site (op) | feeds | what it controls |
|---|---|---|
| `SUB.W D4,D0` (CinterPlay note-range walk, `.noteloop`) | `BGE` (`flag_n==flag_v`) | **which instrument** a note selects |
| `ADD.B D0,D0` (CinterComputePeriods, before `.slide`) | `BVC` | **note pitch** (slide vs period-table) |
| `CMP.L D5,D6` (`.sampleloop`) | `BLT` | synth inner sample loop length |
| `CMP.W #(CINTER_DEGREES/4),D7` (sine-table gen) | `BLT` | sine quadrant build |

**Fix:** compute V at each. Overflow formulas (mask to the op width):
- `ADD a+b` → `V = ((a^r) & (b^r)) >> (W-1)`  (for `a+a`: `(a^r) >> (W-1)`)
- `SUB a-b` / `CMP a,b` → `V = ((a^b) & (a^r)) >> (W-1)`
  where `r = a-b`, W = 8/16/32 for `.B/.W/.L`.

Example (the note-select one, the most impactful):
```c
{  /* SUB.W D4,D0 — V needed by the following BGE that picks the instrument */
    uint16_t _a=(uint16_t)W(d0), _b=(uint16_t)W(d4), _sr=(uint16_t)(_a-_b);
    flag_v = ((((_a ^ _b) & (_a ^ _sr)) >> 15) & 1);
    W(d0)=(uint16_t)_sr; flag_z=((int16_t)_sr==0); flag_n=((int16_t)_sr<0);
}
```

**Audit procedure (do this in your copy):** for every `flag_n==flag_v`, `flag_n!=flag_v`,
`if (flag_v)`, `if (!flag_v)`, `while(... flag_v)`, check that the *immediately preceding*
arithmetic block assigns `flag_v`. If it only sets Z/N (and maybe C), it's a bug. Six such
sites existed in Cinter4; there are now zero. This is the single highest-yield transpiler
bug class — CMP/ADD/SUB feeding a signed/overflow branch.

---

## Fix 6 — soft-Paula used a hardcoded output rate (notes cut short / pitched high)

**Symptom:** song sounds thin/empty, notes don't sustain their full length; subtly too
high-pitched. Tempo is correct.
**Cause:** `paula_set_period` (`paula_soft.c`) computed the resample step as
`step = clock / (period * PAULA_RATE_PAL)` with `PAULA_RATE_PAL` a hardcoded **28150**,
but the AudioWorklet renders at the AudioContext rate (44100/48000). The step assumed a
28150 Hz output, so at 48k every sample advanced ~1.7× too fast → each note played ~59%
of its duration (cut short → gaps → "empty") and ~9 semitones high. The 50 Hz tick clock
(`s_samples_per_tick = sr/50`) DID use the real rate, so tempo was right — which masked it.
**Fix:** add `paula_set_output_rate(rate)`, store `s_output_rate`, use it in the step;
call it from `player_set_sample_rate` / `player_init` with the real rate. Verified: 48k
non-silent fill 80% → 94.5%, now consistent across 28150/44100/48000.

> Generic soft-replayer lesson: the resample step must divide by the *actual* output
> sample rate, not a chip-native constant. Any hardcoded output-rate constant in a step/
> increment calc is a bug as soon as the host runs at a different rate.

---

## Fix 7 (OPTIONAL) — per-channel oscilloscope scope buffers

Playback-irrelevant; skip unless you want per-voice scope visualization. Cinter4
originally fed no scope data (4 lanes sat dead in the UI). Wiring:

In `paula_soft.c` `paula_render`, capture each channel pre-mix into a ring:
```c
#define SCOPE_LEN 256
static int16_t s_scope[PAULA_CHANNELS][SCOPE_LEN];
static int     s_scope_pos = 0;
/* per frame, after computing c0..c3, before mixing L=c0+c3 R=c1+c2: */
s_scope[0][s_scope_pos] = (int16_t)(c0 * 32767.0f);
/* ...c1,c2,c3... */
s_scope_pos = (s_scope_pos + 1) & (SCOPE_LEN - 1);
```
Accessors (export in CMakeLists EXPORTED_FUNCTIONS, add `HEAP16` to
EXPORTED_RUNTIME_METHODS):
```c
uintptr_t paula_scope_ptr(int ch) { return (uintptr_t)s_scope[ch]; }
int       paula_scope_len(void)   { return SCOPE_LEN; }
int       paula_scope_pos(void)   { return s_scope_pos; }
```
Worklet reads the 4 rings (reorder by pos) every ~768 samples, posts
`{type:'scope',channels}`; engine forwards to the scope store. All app-side.

---

## Raw (non-Cinter) instrument support — player API note

Songs whose `.cinter4` starts with a **negative** first word have N raw instruments;
CinterConvert emits a second `.raw` file (concatenated raw PCM). The WASM API already
has `player_load_raw(data, len, offset)` for this. **Order matters:** call
`player_load_raw(raw, raw_len, 0)` **before** `player_load(song)` — `CinterMakeInstruments`
reads the raw PCM from the start of instrument space at synth time. (Host-side wiring to
find/load the `.raw` sibling is app-specific.)

## Build / verify
```
cd cinter4-wasm/build && emmake make -j4   # → public/cinter4/Cinter4.{js,wasm}
```
Headless smoke test: load `Cinter4.js` glue (copy to a temp `.cjs` if your project is
`type:module`), `player_set_sample_rate` → (`player_load_raw` if raw) → `player_load`
→ loop `player_render(buf, frames)`, read `HEAPF32`. A correct render shows sustained,
time-varying RMS (the song progressing), not 50ms blips.
