// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct RkModule RkModule;

RkModule* rk_create(const uint8_t* data, size_t size, float sample_rate);
void rk_destroy(RkModule* module);

int rk_subsong_count(const RkModule* module);
bool rk_select_subsong(RkModule* module, int subsong);

int rk_channel_count(const RkModule* module);
void rk_set_channel_mask(RkModule* module, uint32_t mask);

size_t rk_render(RkModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t rk_render_multi(RkModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool rk_has_ended(const RkModule* module);

// Edit API
int rk_get_instrument_count(const RkModule* module);

float rk_get_instrument_param(const RkModule* module, int inst, const char* param);
void rk_set_instrument_param(RkModule* module, int inst, const char* param, float value);

size_t rk_export(const RkModule* module, uint8_t* out, size_t max_size);

// Set the note of the note command at file_offset, as the grid shows it:
// `note` is the period-table index heard at sub-song 1's position-list entry
// `position` on `channel` (that entry's transpose included). The command's
// wait byte (the row's duration) is kept. Returns 1 when written, 0 when no
// note command of that entry's track starts there. The importer maps a grid
// cell to the offset.
int rk_set_cell(RkModule* module, int position, int channel, uint32_t file_offset, uint8_t note);

// The note command at file_offset as (note << 8) | wait, or -1.
int rk_get_cell(const RkModule* module, uint32_t file_offset);


#ifdef __cplusplus
}
#endif
