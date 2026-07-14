---
date: 2026-07-15
topic: uade-3.05 CIA-interrupt scheduler — cycle-true timing for SunTronic byte-exact
tags: [suntronic, uade, cia, timing, gate-2, native-port]
status: final
---

# uade-3.05 CIA scheduler: cycle-true timing for the SunTronic Gate-2 residual

## Motivation

`SunTronicPlayer.ts` (native TS port) is byte-exact for note/instrument content
but leaves **14/632 golden mismatches (97.8%)** on the per-fire `$20` (AUDxPER)
period stream. The golden is proven **cycle-true / render-independent**
(`SunTronicPlayer.ts:29-33`; probe `emit-ch1-diag`). Every constant-rate CIA
accumulator model floors at 14 (float / 128-chunk / E-clock), and a cheating
joint-greedy ORACLE over 4 voices still floors at 11 — so the residual is not a
TS-side knob. This doc documents **what the uade-3.05 CIA scheduler actually is**
(Phase-1 research, documentary — no fix proposed) so a plan can decide whether a
C-level spike that emits the exact per-fire cycle schedule can drive the residual
to 0.

Investigated the real source (three parallel read-only passes). All file:line
refs are to `third-party/uade-3.05/src/` unless noted.

## 1. CIA timer model (`cia.c`, `include/cia.h`)

- **Counters**: `ciaata ciaatb ciabta ciabtb` — 16-bit down-counters (`cia.c:51`).
  **Reload latches**: `ciaala ciaalb ciabla ciablb` (`cia.c:60`), loaded by CPU
  writes to timer offsets 4-5 (Timer A) / 6-7 (Timer B).
- **Control** `ciaacra/crb ciabcra/crb` (`cia.c:50`): bit0 start, bit3 one-shot,
  bit5-6 input-source select.
- **Countdown** (`CIA_update`, `cia.c:108-174`): timers decrement by `ciaclocks`
  per update; underflow when `(ciaata+1) == ciaclocks` (`cia.c:121`), reload
  `ciaata = ciaala` (`cia.c:153`), one-shot clears start bit (`cia.c:154`).
- **Player interrupt = CIA-A Timer A underflow.** On `aovfla` (`cia.c:151-158`):
  set `ciaaicr |= 1; RethinkICRA();`, reload, then the WASM hook
  `uade_wasm_on_cia_a_tick()` (`cia.c:156`, guarded `#ifdef UADE_WASM`). This is
  the exact instant the SunTronic tick routine (loaded addr `0x2660e`) is driven.
  **Not VBLANK** — score.s installs a level-6 VBI server chain
  (`amigasrc/score/score.s:3500-3515`) but the note engine fires on CIA-A TA.
- **Interrupt raise** `RethinkICRA/RethinkICRB` (`cia.c:79-104`): if
  `ciaXimask & ciaXicr`, set bit7 and `custom_bank.wput(0xDFF09C, 0x8008|0xA000)`
  → INTREQ → 68k level 2/6.

## 2. Event scheduler (`include/events.h`, `custom.c`)

WinUAE-derived cycle-accurate queue.

- **`struct ev { active; evtime; oldcycles; handler; }`** (`events.h:19-24`);
  slots enum `ev_hsync ev_copper ev_cia ev_blitter ev_diskblk ev_diskindex`,
  `ev_max=6` (`events.h:26-32`). `evtime` is an **absolute** cycle timestamp.
- **Core loop** `do_cycles_slow` (`events.h:58-81`): increments the global
  `cycles` counter **one at a time**; when `++cycles == nextevent`, fires every
  handler whose `evtime == cycles`, then `events_schedule()` recomputes
  `nextevent` as the min over active slots (`events.h:34-56`).
- **CIA handler registered** `eventtab[ev_cia].handler = CIA_handler`
  (`custom.c:1336`). `CIA_handler` = `CIA_update(); CIA_calctimers();`
  (`cia.c:234-238`). `CIA_calctimers` (`cia.c:176-232`) computes time-to-underflow
  `(DIV10-div10) + DIV10*ciaata` (`cia.c:183`) and reschedules
  `eventtab[ev_cia].evtime = ciatime + cycles` (`cia.c:229`).
- **Audio/Paula** advances in `update_audio` (`audio.c:637-700`), called from
  `hsync_handler` (`custom.c:1267-1325`). Sample output when the float
  accumulator `next_sample_evtime` rounds to a cycle boundary
  (`audio.c:689 (*sample_handler)()`); DMA sample-fetch on each scanline.

## 3. Clock constants — resolved

Agent-1 flagged a `DIV10=5` "per-5 vs per-10 CPU cycles" ambiguity. **Resolved by
cross-reference with the audio math** (authoritative because derived, not asserted):

- `SOUNDTICKS_PAL = 3546895` master cycles/frame (`custom.h:87`);
  `sample_evtime_interval = SOUNDTICKS/rate` (`audio.c:594`) →
  `3546895/44100 ≈ 80.4 cycles/sample`. Therefore the global `cycles` counter
  ticks the **PAL colour clock = 3.546895 MHz**, NOT the 7 MHz CPU clock.
- `DIV10=5` (`cia.c:29`) → CIA clock `= 3546895 / 5 = 709379 Hz`, the **canonical
  PAL E-clock (709.379 kHz)**. So `DIV10=5` is correct, not a bug.
- **Discrepancy resolved**: Agent-3 framed the grid as 7 MHz / 159-cyc-per-sample.
  That mislabels the counter unit. Both framings reach the same conclusion; this
  doc uses the colour-clock framing (80.4 cyc/sample; CIA period in E-clocks).
- `CYCLE_UNIT=512` (`sysdeps.h:341`), `MAXHPOS_PAL=227` `MAXVPOS_PAL=312`
  (`custom.h:76-92`).

## 4. WASM render path (`uade-wasm/src/`)

- `uade_wasm_render` (`entry.c:537-598`) → `guarded_read` (`entry.c:286-296`) →
  `uade_read()` pumps N float32 samples.
- `uade_wasm_on_cia_a_tick` (`entry.c:618-677`), called from `cia.c:156` on every
  CIA-A TA fire: increments `g_uade_tick_count`; when snapshotting enabled,
  captures all 4 Paula channel regs (period/vol/DMA/ptr) **at that exact cycle**.
- Register+PC capture on first write to a target addr: `g_capture_addr`,
  `g_capture_regs[16]`, `g_capture_pc` (`entry.c:90-99`) — the mechanism behind
  the cycle-true golden.

## 5. Decisive finding — the residual is sub-sample cycle jitter

**The CIA play-interrupt fires at E-clock cycle granularity, on a grid that does
not align to the audio sample grid.**

- CIA fires when `cycles == eventtab[ev_cia].evtime` (`events.h:61`) — an
  absolute position on the 3.546895 MHz colour-clock grid, spaced by the CIA
  period in E-clocks (×5 colour cycles).
- Samples land every ~80.4 colour cycles (`audio.c:594`).
- 80.4 and the CIA period are **incommensurate** → each fire's `$20` period write
  lands at a fractional sample offset that drifts fire-to-fire. A constant
  samples-per-tick accumulator (`ciaTickSamples`) cannot reproduce that drift; it
  only carries the seed phase (`rowPhaseSamples`), which is why the best fit
  (`ciaTick=881.5`, phase≈0) still floors at 14 (`SunTronicPlayer.ts:24-25`).
- This is exactly the gap the player comment already names
  (`SunTronicPlayer.ts:42-45`): "the exact CIA-interrupt landing relative to the
  1024-sample boundary, quantized to UADE's event-scheduler cycle grid … below
  any TS accumulator knob."
- Existing probes that measure it: `tools/suntronic-re/emit-ch1-diag.ts:72-73`
  (memory-write capture on period reg, 1-sample chunks),
  `tools/suntronic-re/probe-cia-sweep.ts:21-52` (best-fit 881.5 still 14/632),
  `tools/suntronic-re/p7j-acctrace-oracle.ts:92-119` (per-tick byte-access trace).

**881.5 samples/tick = 44100/881.5 ≈ 50.03 Hz** → the CIA period is set to the
PAL 50 Hz frame rate for these two fixtures (gliders, ballblaser); tempo is not
43 Hz as one pass loosely stated.

## 6. Implications for a byte-exact TS port (options — for the plan phase, NOT decided here)

The residual is a property of WHERE the CIA interrupt lands on the cycle grid.
Three levels a fix could live at:

1. **C-level cycle-schedule emitter (spike).** Extend `uade_wasm_on_cia_a_tick`
   to also record, per fire, the exact `cycles` timestamp (or the fractional
   sample offset `cycles/80.4`). Feed that measured per-fire schedule into the
   already-existing diagnostic hook `SunTronicPlayer.subtickSchedule`
   (`SunTronicPlayer.ts:~135`) via `probe-schedule-inject`. This **isolates the
   two unknowns**: if injecting the exact schedule drives the residual to 0, the
   TS player logic is fully correct and the only gap was the schedule → a
   committed WASM-free golden schedule table could then close Gate-2. If it does
   NOT reach 0, there is additional player-logic error to find. Cost: a few lines
   of C + one probe run; **decisive measurement, cheapest discriminator**. Does
   not itself ship a fix — it tells us which fix is needed.
2. **Reproduce the CIA event scheduler in TS** (port `CIA_calctimers` +
   `do_cycles` phase accounting). Byte-exact in principle but re-implements the
   incommensurate-grid arithmetic and the interaction with hsync/audio events;
   large surface, high risk, and still needs the C oracle to validate. Only
   justified if option 1 proves the schedule alone closes it AND a pure-constant
   table is deemed too fragile across the ~20 target formats.
3. **Accept 97.8%** — keep `describe.skip`, ship native playback as
   audition-only. The current state. Rejected as the goal per the pilot mandate
   (prove ONE format byte-exact).

Recommended first step for the plan: **option 1** — it is a measurement, not a
commitment, and it tells us whether option 2 is even necessary. Hardcoding the
oracle greedy schedule as a fix remains FORBIDDEN (band-aid); emitting the
*measured cycle schedule* to answer "is the player logic correct?" is diagnosis,
not a band-aid. Whether a committed schedule table is an acceptable *shipped*
carrier (vs. a live TS scheduler) is the open decision for the plan.

## 7. Open questions (resolve in the plan, not here)

1. Does injecting the measured per-fire cycle schedule (`subtickSchedule`) drive
   gliders+ballblaser to 0? (Answers "player logic correct given schedule?".)
2. If yes: is a **committed per-song schedule table** WASM-free-CI-acceptable, or
   does the constraint "no hardcoded band-aid — express as a clock accumulator"
   forbid a table even when it is the *measured* cycle grid, not a fitted fudge?
   This is a user decision — the schedule is real emulator state, but it is not a
   closed-form accumulator.
3. Does the schedule generalise across the ~20 other target formats, or is it
   per-song? (If per-song, a TS scheduler (option 2) may be the only scalable
   path.)
4. What is the CIA period register value SunTronic writes at init, read from the
   loaded module (per "no guessing constants")? Confirms the 881.5 = 50 Hz.

## 9. CORRECTION (2026-07-15b) — CIA-scheduler premise FALSIFIED by measurement

**The entire "CIA cycle scheduler / sub-fire jitter" premise of this doc and the
companion plan is WRONG.** Direct whole-song measurement overturns it. Keep §1-8
only as a record of the discarded hypothesis.

### What was measured (tools/suntronic-re/probe-fullsong-fires.ts, probe-fire-eclock.ts)

1-sample-step the real UADE render over the whole song, capturing the tick-handler
write-PC fire and the `$24` vibrato update:
- **gliders**: 661/661 inter-fire gaps = **exactly 1024 samples**. Zero non-1024 gaps.
- **ballblaser**: 330/330 gaps = **exactly 1024**. Zero anomalies.
- The note-fetch PC fire and the `$24` update are in **lockstep at the same sample
  indices** — ONE clock, not two. No tempo change, no fractional/sub-sample jitter.

Consequences:
- `SunTronic does NOT use CIA-A Timer-A in UADE` — `tick_count=0`,
  `uade_wasm_on_cia_a_tick` never fires (proven; the CIA fire-log oracle returned 0
  fires). The whole §5-§7 CIA-period model is inapplicable.
- The clock is a constant **1024 samples/tick (43.07 Hz)**, NOT 881.5 (fitted
  `ciaTickSamples`) and NOT 882 (vblank). The player's TWO-CLOCK model
  (`SunTronicPlayer.ts:14-50, 424-458`, `ciaTick=881.5`) is chasing a phantom —
  its `moduleTicks` oscillates 1/2 per fire when the real answer is a constant 1.

### Where the residual actually lives (probe-native-vs-golden.ts)

Committed player (881.5) vs golden: **130/316 mismatches (gliders)**. Two classes,
BOTH per-tick arithmetic — no timing/scheduler involved:
1. **Vibrato depth/phase arithmetic** — dominant. Active voices (v0/v1) wobble
   `±1..7` in `$20` period with oscillating sign while `$08` acc matches exactly.
   Present under 881.5 AND under a corrected single-1024 clock (141/316) — so it is
   NOT a clock knob. Root is in `stepEffects()` vibrato math (`SunTronicPlayer.ts:361-374`,
   `advanceVib` 335-339) vs the EFFECTS disasm (0x267f6) — depth-table index / phase
   seeding / compute-then-advance ordering.
2. **Small note-on / row-timing offset** — v2 sounds `p214` at golden t4 but native
   t6 (2-tick lag under 881.5); v3 similar. GETNEXTNOTE (0x2692a) reaches `noteOn`
   one row late for later-starting voices. Decode/sequencing, not fractional timing.

### Corrected fix direction

- Set the clock to a **single constant 1024 samples/tick, `moduleTicks==1` every
  fire** (delete the `ciaTick`/`rowPhase`/`subtickSchedule` two-clock apparatus).
- Then fix the two arithmetic bugs against the loaded disasm (EFFECTS vibrato,
  GETNEXTNOTE note-on row timing). NO WASM change, NO CIA scheduler port, NO
  committed schedule table needed. The golden is a valid per-tick oracle (render-
  independent, sampled at the fire instant == the vibrato-update instant).
- The plan `2026-07-15-suntronic-cia-scheduler-port.md` is SUPERSEDED by this.

## 8. File:line reference index

| What | Where |
|------|-------|
| CIA-A TA underflow → player tick | `cia.c:151-158` (`uade_wasm_on_cia_a_tick` @156) |
| CIA counters / latches / control | `cia.c:50-60`, `cia.c:108-174` |
| CIA reschedule math | `cia.c:176-232` (`evtime` @229, formula @183, `DIV10=5` @29) |
| Interrupt raise to CPU | `cia.c:79-104` |
| Event struct / slots | `events.h:19-32` |
| Core cycle loop / min-event | `events.h:58-81`, `events.h:34-56` |
| CIA handler registration | `custom.c:1336` |
| Audio advance / sample output | `audio.c:637-700` (`sample_handler` @689, interval @594) |
| hsync + Paula DMA fetch | `custom.c:1267-1325` |
| Clock constants | `custom.h:76-92`, `sysdeps.h:341` |
| WASM render entry | `uade-wasm/src/entry.c:537-598`, `:286-296` |
| WASM CIA-tick hook / capture | `uade-wasm/src/entry.c:618-677`, `:90-99` |
| TS player residual + knobs | `SunTronicPlayer.ts:24-45`, ctor `ciaTick=881.5` |
| TS diagnostic schedule inject | `SunTronicPlayer.ts:~135` (`subtickSchedule`) |
| Existing cycle-jitter probes | `tools/suntronic-re/{emit-ch1-diag,probe-cia-sweep,p7j-acctrace-oracle}.ts` |
