// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct FtmModule FtmModule;

FtmModule* ftm_create(const uint8_t* data, size_t size, float sample_rate);
void ftm_destroy(FtmModule* module);

int ftm_subsong_count(const FtmModule* module);
bool ftm_select_subsong(FtmModule* module, int subsong);

int ftm_channel_count(const FtmModule* module);
void ftm_set_channel_mask(FtmModule* module, uint32_t mask);

size_t ftm_render(FtmModule* module, float* interleaved_stereo, size_t frames);
size_t ftm_render_multi(FtmModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool ftm_has_ended(const FtmModule* module);

// Edit API
int ftm_get_instrument_count(const FtmModule* module);
int ftm_get_num_measures(const FtmModule* module);
int ftm_get_rows_per_measure(const FtmModule* module);

// Grid cells: `channel` is the track (0-7), `row` the song row (measure *
// rows per measure + row), as PlayFTM places a track's events. A cell is the
// event on that row: note (0 none, 1-34, 35 release), effect (FtmTrackEffect
// 0-14: 0 instrument only, 1-10 volume step + instrument, 11 SEL, 12 pitch
// bend, 13 volume down, 14 pattern loop) and its 6-bit argument.
void ftm_get_cell(const FtmModule* module, int channel, int row,
                   uint8_t* note, uint8_t* effect, uint16_t* effect_arg);
// Writes, inserts or (all zero) removes the event on that row, re-spacing the
// track. Returns 1 when done, 0 for an invalid cell or a row that holds a
// pattern loop point (not a grid cell).
int ftm_set_cell(FtmModule* module, int channel, int row,
                  uint8_t note, uint8_t effect, uint16_t effect_arg);

float ftm_get_instrument_param(const FtmModule* module, int inst, const char* param);
void ftm_set_instrument_param(FtmModule* module, int inst, const char* param, float value);

size_t ftm_export(const FtmModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
