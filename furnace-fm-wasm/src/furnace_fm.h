/*
 * furnace_fm.h — Furnace FM Instrument Editor (SDL2/Emscripten)
 *
 * Hardware-accurate FM synth instrument editor covering 12 FM chip types:
 * OPN, OPM, OPL, OPLL, OPZ, OPNA, OPNB, OPL4, Y8950, OPN2203, OPNBB, ESFM
 *
 * Features:
 * - Algorithm diagram with operator connection topology
 * - Per-operator cards with ADSR visualization
 * - Chip-specific parameter support (D2R, SSG, waveform select, etc.)
 * - OPLL preset selector
 */

#ifndef FURNACE_FM_H
#define FURNACE_FM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Chip Subtype Indices ──────────────────────────────────────────────── */
#define FM_CHIP_OPN     0   /* YM2612 (Genesis) — 4-op, TL 127, AR/DR 31, SSG */
#define FM_CHIP_OPM     1   /* YM2151 — 4-op, TL 127, AR/DR 31, DT2 */
#define FM_CHIP_OPL     2   /* YM3812/OPL3 — 2/4-op, TL 63, AR/DR 15, WS, KSL */
#define FM_CHIP_OPLL    3   /* YM2413 — 2-op, TL 63, AR/DR 15, presets */
#define FM_CHIP_OPZ     4   /* YM2414 — 4-op, TL 127, AR/DR 31, DT2 */
#define FM_CHIP_ESFM    5   /* ESFM — 4-op, TL 63, AR/DR 15, WS, KSL */
#define FM_CHIP_OPNA    6   /* YM2608 — same as OPN */
#define FM_CHIP_OPNB    7   /* YM2610 — same as OPN */
#define FM_CHIP_OPL4    8   /* YMF278 — same as OPL */
#define FM_CHIP_Y8950   9   /* Y8950 — same as OPL */
#define FM_CHIP_OPN2203 10  /* YM2203 — same as OPN */
#define FM_CHIP_OPNBB   11  /* YM2610B — same as OPN */
#define FM_CHIP_COUNT   12

/* ── Config Buffer Layout ──────────────────────────────────────────────── */
/*
 * Header (8 bytes):
 *   [0]  chip_subtype (uint8)
 *   [1]  algorithm (0-7)
 *   [2]  feedback (0-7)
 *   [3]  fms
 *   [4]  ams
 *   [5]  ops_count (2 or 4)
 *   [6]  opll_preset
 *   [7]  flags (bit0=fixedDrums)
 *
 * Per-operator (20 bytes x ops_count):
 *   [0]   enabled
 *   [1]   mult
 *   [2]   tl
 *   [3]   ar
 *   [4]   dr
 *   [5]   d2r
 *   [6]   sl
 *   [7]   rr
 *   [8]   dt (signed int8)
 *   [9]   dt2
 *   [10]  rs
 *   [11]  am
 *   [12]  ksr
 *   [13]  ksl
 *   [14]  sus
 *   [15]  vib
 *   [16]  ws
 *   [17]  ssg
 *   [18-19] reserved
 */

#define FM_HEADER_SIZE     8
#define FM_OP_SIZE         20
#define FM_MAX_OPS         4
#define FM_CONFIG_SIZE     (FM_HEADER_SIZE + FM_MAX_OPS * FM_OP_SIZE)  /* 88 bytes */

/* ── Public API ────────────────────────────────────────────────────────── */

/** Initialize SDL2 canvas and rendering state */
void furnace_fm_init(int w, int h);

/** Start the SDL main loop (60 fps) */
void furnace_fm_start(void);

/** Tear down SDL resources */
void furnace_fm_shutdown(void);

/** Load config from packed buffer (see layout above) */
void furnace_fm_load_config(const uint8_t *buf, int len);

/** Dump current config to buffer. Returns bytes written. */
int furnace_fm_dump_config(uint8_t *buf, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* FURNACE_FM_H */
