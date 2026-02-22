/*
 * furnace_wave.h — Furnace Wavetable Instrument Editor (SDL2/Emscripten)
 *
 * Hardware-accurate wavetable editor covering 10+ wavetable chip types:
 * SCC, N163, FDS, PCE, VB, SWAN, Lynx, X1_010, BUBBLE, NAMCO
 */

#ifndef FURNACE_WAVE_H
#define FURNACE_WAVE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Chip Subtypes */
#define WAVE_CHIP_SCC     0   /* Konami SCC — 32-sample, 8-bit signed */
#define WAVE_CHIP_N163    1   /* Namco N163 — variable length, 4-bit */
#define WAVE_CHIP_FDS     2   /* Famicom Disk System — 64-sample, 6-bit */
#define WAVE_CHIP_PCE     3   /* PC Engine — 32-sample, 5-bit */
#define WAVE_CHIP_VB      4   /* Virtual Boy — 32-sample, 6-bit */
#define WAVE_CHIP_SWAN    5   /* WonderSwan — 32-sample, 4-bit */
#define WAVE_CHIP_LYNX    6   /* Atari Lynx — 32-sample, 8-bit */
#define WAVE_CHIP_X1_010  7   /* Sharp X1-010 — 128-sample, 8-bit */
#define WAVE_CHIP_BUBBLE  8   /* Bubble System — 32-sample */
#define WAVE_CHIP_NAMCO   9   /* Namco WSG — 32-sample, 4-bit */
#define WAVE_CHIP_COUNT   10

/* Config buffer layout:
 * Header (4 bytes):
 *   [0]  chip_subtype (0-9)
 *   [1]  wave_count (number of wavetables, 1-256)
 *   [2]  current_wave (selected wavetable index)
 *   [3]  wave_len (samples per wave: 32, 64, 128, or 256)
 *
 * Wave data (256 bytes max):
 *   [4..259]  waveform samples (uint8, one per sample)
 *
 * FDS modulation (34 bytes, FDS only):
 *   [260..291] modTable (32 signed int8 values, -4 to +3)
 *   [292-293]  modSpeed (uint16 LE)
 *   [294]      modDepth
 *   [295]      reserved
 *
 * N163 settings (4 bytes, N163 only):
 *   [296]  wavePos
 *   [297]  waveLen
 *   [298]  waveMode
 *   [299]  reserved
 *
 * Total max: 300 bytes
 */

#define WAVE_HEADER_SIZE   4
#define WAVE_DATA_SIZE     256
#define WAVE_FDS_SIZE      36
#define WAVE_N163_SIZE     4
#define WAVE_CONFIG_SIZE   (WAVE_HEADER_SIZE + WAVE_DATA_SIZE + WAVE_FDS_SIZE + WAVE_N163_SIZE)  /* 300 bytes */

void furnace_wave_init(int w, int h);
void furnace_wave_start(void);
void furnace_wave_shutdown(void);
void furnace_wave_load_config(const uint8_t *buf, int len);
int  furnace_wave_dump_config(uint8_t *buf, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* FURNACE_WAVE_H */
