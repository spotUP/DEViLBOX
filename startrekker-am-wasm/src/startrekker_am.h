#pragma once
// startrekker_am.h — StarTrekker AM replayer C port
// Based on StarTrekker_v1.2_AM.s by Björn Wesen / Exolon of Fairlight
#ifndef STARTREKKERAM_H
#define STARTREKKERAM_H

#include <stdint.h>

// Initialise replayer with module + NT file data.
// mod_data: pointer to the .mod/.adsc module (standard ProTracker MOD format)
// nt_data:  pointer to the .nt companion file (StarTrekker AM instrument data)
// Returns 1 on success, 0 on failure.
int  sam_init(const uint8_t* mod_data, int mod_len,
              const uint8_t* nt_data,  int nt_len);

// Advance one tick (call at 50 Hz for PAL timing).
void sam_music(void);

// Stop all audio DMA.
void sam_end(void);

// Get per-channel voice info: [instr0, pos0, instr1, pos1, ...]
// instr = instrument number (1-31, 0=none), pos = sample position fraction (0-1)
void sam_get_voice_info(float* out8);

// Write a 4-byte ProTracker pattern cell directly to MOD data in WASM memory.
void sam_set_pattern_cell(int pattern, int row, int channel, const uint8_t* cell4);

// Write a 16-bit value to NT instrument data at the given byte offset.
// instr: 1-based instrument number, offset: byte offset within the 120-byte block.
void sam_set_nt_param(int instr, int offset, int value);

#endif /* STARTREKKERAM_H */
