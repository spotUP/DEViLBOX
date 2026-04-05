/* prt_replayer.h — PreTracker replayer (decompiled from pretracker.bin)
 * Original: (c) Pink/aBYSs, PreTracker 1.5, LGPL
 * Decompiled via Ghidra 12.0 + manual translation
 */
#pragma once
#include <stdint.h>

/* ── Paula Hardware Register Shim ─────────────────────────────────── */
/* These map Amiga custom chip writes to paula_soft.h API calls */

void prt_paula_write_dmacon(uint16_t val);
void prt_paula_write_aud(int ch, uint32_t ptr, uint16_t len, uint16_t per, uint16_t vol);
void prt_paula_set_ptr(int ch, const uint8_t *ptr);
void prt_paula_set_len(int ch, uint16_t len_words);
void prt_paula_set_per(int ch, uint16_t period);
void prt_paula_set_vol(int ch, uint16_t vol);

/* ── Channel State (stride = 0x27E per channel) ──────────────────── */
/* Offsets derived from Ghidra decompilation of initChannel/playerTick */
/* There are 4 channels in the player state at offsets:
 *   ch0: +0x000, ch1: +0x27E, ch2: +0x502 (NOT 0x4FC!), ch3: +0x77A
 * But these overlap with the "song" struct below, so we access raw bytes.
 */

/* Player state is a large byte buffer (~0xA03+ bytes) */
#define PRT_STATE_SIZE  0x1C76  /* from memset in prt_playerInit */

/* Channel base offsets within player state */
#define PRT_CH0_BASE    0x0000
#define PRT_CH1_BASE    0x027E
#define PRT_CH2_BASE    0x0502
#define PRT_CH3_BASE    0x077A

/* Song data structure (pointed to by player state at offset 0x9FE) */
/* Populated by prt_songInit from the PRT file binary */

/* ── API ──────────────────────────────────────────────────────────── */

/* Parse PRT module, populate song data. Returns chipmem size needed, or 0 on error. */
int prt_song_init(uint8_t *song_data, const uint8_t *module, uint32_t module_size);

/* Initialize player state with generated waveforms.
 * chipmem must be at least the size returned by prt_song_init.
 * chipmem_ptr will be set as the base pointer for waveform data. */
void prt_player_init(uint8_t *state, uint8_t *chipmem, uint8_t *song_data);

/* Start playing a subsong (0-based index) */
void prt_start_song(uint8_t *state, int subsong);

/* Advance playback by one tick (call at 50 Hz) */
void prt_player_tick(uint8_t *state);

/* Stop playback */
void prt_stop(uint8_t *state);

/* Set master volume (0-64) */
void prt_set_volume(uint8_t *state, uint8_t vol);
