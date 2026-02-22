/*
 * furnace_macro.h — Furnace Macro Editor (SDL2/Emscripten)
 *
 * Sub-canvas macro sequence editor for all Furnace instrument types.
 * Renders below the main instrument editor (FM/PSG/Wave/PCM).
 *
 * Features:
 * - Macro type tabs (Vol, Arp, Duty, Wave, Pitch, etc.)
 * - Sequence editor with up to 256 steps
 * - Loop and release point markers
 * - Click/drag to edit values
 */

#ifndef FURNACE_MACRO_H
#define FURNACE_MACRO_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Macro types */
#define MACRO_VOL      0
#define MACRO_ARP      1
#define MACRO_DUTY     2
#define MACRO_WAVE     3
#define MACRO_PITCH    4
#define MACRO_EX1      5
#define MACRO_EX2      6
#define MACRO_EX3      7
#define MACRO_COUNT    8

/* Config buffer layout:
 * Header (4 bytes):
 *   [0]  active_macro (which tab is selected, 0-7)
 *   [1]  macro_len (0-255, length of current macro)
 *   [2]  loop_pos (0-254, or 255=no loop)
 *   [3]  rel_pos (0-254, or 255=no release)
 *
 * Macro data (256 bytes):
 *   [4..259]  macro values (int8, signed for pitch/arp, unsigned for others)
 *
 * Range info (4 bytes):
 *   [260] min_val (int8)
 *   [261] max_val (int8)
 *   [262] macro_mode (0=sequence, 1=ADSR, 2=LFO)
 *   [263] reserved
 *
 * Total: 264 bytes
 */

#define MACRO_HEADER_SIZE  4
#define MACRO_DATA_SIZE    256
#define MACRO_RANGE_SIZE   4
#define MACRO_CONFIG_SIZE  (MACRO_HEADER_SIZE + MACRO_DATA_SIZE + MACRO_RANGE_SIZE)  /* 264 bytes */

void furnace_macro_init(int w, int h);
void furnace_macro_start(void);
void furnace_macro_shutdown(void);
void furnace_macro_load_config(const uint8_t *buf, int len);
int  furnace_macro_dump_config(uint8_t *buf, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* FURNACE_MACRO_H */
