/*
 * furnace_pcm.h — Furnace PCM Instrument Editor (SDL2/Emscripten)
 *
 * Simplified sample editor for PCM chip types:
 * SEGAPCM, QSOUND, ES5506, RF5C68, C140, K007232, K053260, GA20,
 * OKI, YMZ280B, MULTIPCM, AMIGA
 */

#ifndef FURNACE_PCM_H
#define FURNACE_PCM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PCM_CHIP_SEGAPCM    0
#define PCM_CHIP_QSOUND     1
#define PCM_CHIP_ES5506     2
#define PCM_CHIP_RF5C68     3
#define PCM_CHIP_C140       4
#define PCM_CHIP_K007232    5
#define PCM_CHIP_K053260    6
#define PCM_CHIP_GA20       7
#define PCM_CHIP_OKI        8
#define PCM_CHIP_YMZ280B    9
#define PCM_CHIP_MULTIPCM   10
#define PCM_CHIP_AMIGA      11
#define PCM_CHIP_COUNT      12

/* Config buffer:
 * Header (8 bytes):
 *   [0]  chip_subtype
 *   [1]  bit_depth (8 or 16)
 *   [2]  loop_enable
 *   [3]  loop_mode (0=forward, 1=pingpong, 2=reverse)
 *   [4-5] sample_rate (uint16 LE)
 *   [6]  filter_enable (ES5506)
 *   [7]  reserved
 *
 * Loop points (8 bytes):
 *   [8-11]  loop_start (uint32 LE)
 *   [12-15] loop_end (uint32 LE)
 *
 * ES5506 filter (4 bytes):
 *   [16-17] filter_k1 (uint16 LE)
 *   [18-19] filter_k2 (uint16 LE)
 *
 * Total: 20 bytes
 */

#define PCM_CONFIG_SIZE  20

void furnace_pcm_init(int w, int h);
void furnace_pcm_start(void);
void furnace_pcm_shutdown(void);
void furnace_pcm_load_config(const uint8_t *buf, int len);
int  furnace_pcm_dump_config(uint8_t *buf, int max_len);
void furnace_pcm_load_pcm(const uint8_t *data, int len);

#ifdef __cplusplus
}
#endif

#endif /* FURNACE_PCM_H */
