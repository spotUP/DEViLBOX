/*
 * furnace_psg.h — Furnace PSG Instrument Editor (SDL2/Emscripten)
 *
 * Hardware-accurate PSG instrument editor covering 19 PSG chip types:
 * NES, GB, C64, SID6581, SID8580, AY, PSG, VIC, TIA, VERA, SAA, TED,
 * VRC6, MMC5, AY8930, POKEY, PET, PCSPKR, SNES
 *
 * Features:
 * - Chip-specific waveform selectors (pulse/tri/noise/saw/env)
 * - Envelope visualization (GB vol envelope, C64 ADSR, SNES ADSR/GAIN)
 * - C64 SID filter section (cutoff/resonance/LP/BP/HP)
 * - Duty cycle / pulse width controls where applicable
 */

#ifndef FURNACE_PSG_H
#define FURNACE_PSG_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Chip Subtype Indices ──────────────────────────────────────────────── */
#define PSG_CHIP_NES      0   /* 2A03 — Pulse(duty)/Tri/Noise, envMode+envValue */
#define PSG_CHIP_GB       1   /* Game Boy — Pulse(duty)/Wave, envVol/envDir/envLen */
#define PSG_CHIP_C64      2   /* SID (generic) — Tri/Saw/Pulse/Noise, ADSR, filter */
#define PSG_CHIP_SID6581  3   /* SID 6581 (warm/gritty) — same params as C64 */
#define PSG_CHIP_SID8580  4   /* SID 8580 (cleaner) — same params as C64 */
#define PSG_CHIP_AY       5   /* AY-3-8910 — Tone/Noise/Env, period/shape */
#define PSG_CHIP_PSG      6   /* TI SN76489 — Tone/Noise, duty, noiseMode */
#define PSG_CHIP_VIC      7   /* VIC-20 — simple waveform, volume */
#define PSG_CHIP_TIA      8   /* Atari 2600 TIA — audc/audf/audv */
#define PSG_CHIP_VERA     9   /* Commander X16 VERA — waveform/duty/volume */
#define PSG_CHIP_SAA      10  /* Philips SAA1099 — Tone/Noise, envelope */
#define PSG_CHIP_TED      11  /* Commodore Plus/4 TED — simple square */
#define PSG_CHIP_VRC6     12  /* Konami VRC6 — Pulse(duty 0-7)/Saw */
#define PSG_CHIP_MMC5     13  /* MMC5 — Pulse(duty), like NES subset */
#define PSG_CHIP_AY8930   14  /* Enhanced AY — Tone/Noise/Env, extended duty */
#define PSG_CHIP_POKEY    15  /* Atari POKEY — audc/audf/audctl */
#define PSG_CHIP_PET      16  /* Commodore PET — simple square, shift register */
#define PSG_CHIP_PCSPKR   17  /* PC Speaker — square wave only */
#define PSG_CHIP_SNES     18  /* Super Nintendo SPC700 — ADSR/GAIN, BRR */
#define PSG_CHIP_COUNT    19

/* ── Config Buffer Layout ──────────────────────────────────────────────── */
/*
 * Packed binary format for pushing config from JS → WASM.
 * All fields are uint8 unless noted.
 *
 * Header (4 bytes):
 *   [0]  chip_subtype (0-18, maps to PSG_CHIP_*)
 *   [1]  waveform (chip-dependent meaning)
 *   [2]  duty / pulse width (low byte)
 *   [3]  flags (bit0=noiseOn, bit1=ringMod, bit2=oscSync, bit3=toFilter,
 *               bit4=filterOn, bit5=filterLP, bit6=filterBP, bit7=filterHP)
 *
 * Envelope section (8 bytes):
 *   [4]  envParam0 — GB: envVol / C64: attack / SNES: attack / NES: envValue
 *   [5]  envParam1 — GB: envDir / C64: decay  / SNES: decay  / NES: envMode
 *   [6]  envParam2 — GB: envLen / C64: sustain / SNES: sustain
 *   [7]  envParam3 — C64: release / SNES: release
 *   [8]  envParam4 — SNES: gainMode
 *   [9]  envParam5 — SNES: gain / NES: sweepPeriod
 *   [10] envParam6 — NES: sweepShift
 *   [11] envParam7 — NES: sweepFlags (bit0=enabled, bit1=negate)
 *
 * Filter section (6 bytes) — C64/SID only:
 *   [12] filterCutoffLo  (cutoff & 0xFF)
 *   [13] filterCutoffHi  (cutoff >> 8)
 *   [14] filterResonance (0-15)
 *   [15] filterFlags (bit0=LP, bit1=BP, bit2=HP, bit3=ch3Off)
 *   [16] dutyHi (duty >> 8, for C64 12-bit duty)
 *   [17] reserved
 *
 * AY/PSG specific (4 bytes):
 *   [18] noiseMode (0=white, 1=periodic)
 *   [19] psgWidth
 *   [20] ayEnvShape
 *   [21] reserved
 *
 * Total: 22 bytes
 */

#define PSG_HEADER_SIZE    4
#define PSG_ENVELOPE_SIZE  8
#define PSG_FILTER_SIZE    6
#define PSG_AY_SIZE        4
#define PSG_CONFIG_SIZE    (PSG_HEADER_SIZE + PSG_ENVELOPE_SIZE + PSG_FILTER_SIZE + PSG_AY_SIZE)  /* 22 bytes */

/* ── Public API ────────────────────────────────────────────────────────── */

/** Initialize SDL2 canvas and rendering state */
void furnace_psg_init(int w, int h);

/** Start the SDL main loop (60 fps) */
void furnace_psg_start(void);

/** Tear down SDL resources */
void furnace_psg_shutdown(void);

/** Load config from packed buffer (see layout above) */
void furnace_psg_load_config(const uint8_t *buf, int len);

/** Dump current config to buffer. Returns bytes written. */
int furnace_psg_dump_config(uint8_t *buf, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* FURNACE_PSG_H */
