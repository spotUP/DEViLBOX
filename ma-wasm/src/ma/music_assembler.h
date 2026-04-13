// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Daniel Collin
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MaModule MaModule;

MaModule* ma_create(const uint8_t* data, size_t size, float sample_rate);
void ma_destroy(MaModule* module);

int ma_subsong_count(const MaModule* module);
bool ma_select_subsong(MaModule* module, int subsong);

size_t ma_render(MaModule* module, float* interleaved_stereo, size_t frames);
bool ma_has_ended(const MaModule* module);

void ma_set_channel_mask(MaModule* module, uint32_t mask);

/* Track data access for pattern editing */
size_t ma_track_count(const MaModule* module);
const uint8_t* ma_track_data(const MaModule* module, size_t trackIdx, size_t* out_length);
void ma_track_replace_data(MaModule* module, size_t trackIdx, uint8_t* newdata, size_t newlen);

/* Instrument preview */
void ma_note_on(MaModule* module, int instrument, int note, int velocity);
void ma_note_off(MaModule* module);
size_t ma_render_preview(MaModule* module, float* interleaved_stereo, size_t frames);
int ma_instrument_count(const MaModule* module);

/* Instrument parameter get/set by name */
float ma_instrument_get_param(const MaModule* module, int index, const char* param);
void ma_instrument_set_param(MaModule* module, int index, const char* param, float value);

#ifdef __cplusplus
}
#endif
