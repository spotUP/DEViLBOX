---
date: 2026-10-12
topic: Up Rough Demo System scratch wet chain (reference for DEViLBOX Auto Scratch)
tags: [scratch, dj, effects, reverb, delay, reference]
status: final
---

# Up Rough Demo System: how scratches are made wet

Owner 2026-10-12: "we process the scratching in the demo system so it doesn't sound so dry, we need that here as well."
Source repo: `/Users/spot/Code/Up_Rough_Demo_System/tools`. All offline Python/numpy, mono, algorithmic Schroeder reverb (no IR file), no compressor ("saturation, not compression").

## Per-gesture chain (`scratch.py` `render_gesture`)

1. Physics: `turntable.py` simulate/render_from_motion + surface noise + crossfader gate; wobble warp 0.4, eccentricity 0.3 (scratch.py ~290-303).
2. Level: gain 0.70 + 0.50 * velocity (scratch.py:210-216).
3. velocity < 0.5: low-pass at 2500 + 6000 * velocity Hz.
4. velocity > 0.85: add 0.15 * high-pass 3000 Hz.
5. `apply_fx` (scratch.py:322-335), order: HP, LP, soft drive (gain 1 + 4 * drive), tape delay (fb 0.25, damp 0.4, mix delay_mix, time delay_s default 0.18 s), room reverb (decay 0.5, mix reverb_mix).

Style profiles (scratch.py:341-345):

| Profile | HP Hz | LP Hz | Drive | Delay mix | Delay time | Reverb mix |
|---|---|---|---|---|---|---|
| BOOMBAP | 150 | 4500 | 0.10 | - | - | 0.05 |
| ELECTRO | 200 | 7000 | 0.05 | 0.12 | 0.14 s | 0.04 |
| LOFI | 120 | 3000 | 0.08 | - | - | 0.10 |
| MEMPHIS | 180 | 3800 | 0.18 | - | - | 0.06 |
| WEST | 150 | 5500 | 0.06 | 0.08 | 0.20 s | 0.05 |

"echo" gesture fx (scratch.py:176): delay_mix 0.35, delay_s 0.16, reverb_mix 0.05. Per-gesture fx at scratch.py:308; profile merged with overrides at scratch.py:824.

## Wet scratch channel (`scratch_routine.py:211-232` `scratch_channel`, "run WET (user preference)")

Defaults: hp 160, lp 5000, presence 0.22, drive 0.09, room 0.28, delay_mix 0.14, headroom 0.75. Order:

1. HP 160 Hz.
2. Presence: + 0.22 * band-pass 1500-3000 Hz.
3. Saturation: tanh(y * (1 + 3 * 0.09)).
4. Tape delay 0.20 s, fb 0.32, damp 0.5, mix delay_mix.
5. Reverb: 0.6 * short_plate + 0.4 * dark_room (each 100 % wet), crossfaded room 0.28 wet / 0.72 dry.
   - short_plate (sampler.py:201): plate, decay 0.7, then LP 6000, HP 350.
   - dark_room (sampler.py:198): room, decay 0.8, then LP 2400.
   - Kinds (synth_dsp.py:684-716): room combs 30/37/41/44 ms g 0.72/0.70/0.68/0.66 pre 5 ms damp 0.2; plate combs 22/29/34/38 ms g 0.80/0.78/0.77/0.75 pre 2 ms damp 0.1; both then allpass 5 ms and 1.7 ms at g 0.7.
6. 4-pole LP 5000 Hz last.
7. Normalise peak 0.75.

Routine presets: scratch_routine.py:318 (defaults), 332-334 (RoutineDry / Dark / Delay).
DJ render: scratch_dj.py:297 calls `scratch_channel(..., room=0.3, delay_mix=0.16, drive=0.10)` - "the channel runs wet".

## Amiga device path (not needed for DEViLBOX)

device_scratch_bus.py (fixed-point parity oracle); fixed reverb softsynth.py:1328 `reverb_fixed`, float reference softsynth.py:1366 (mix 0.25, room 0.8). Unconfirmed whether the live device applies it to the scratch deck.

## Unread pointers

docs/audio-architecture.md:78-112 (Deck-C scratch bus), thoughts/shared/research/2026-07-30_scratch-family-wiring-audit.md, thoughts/shared/TODO_turntablist_audio.md:88-100 (songs "ALL very DRY" note, about songs, not the scratch bus).
