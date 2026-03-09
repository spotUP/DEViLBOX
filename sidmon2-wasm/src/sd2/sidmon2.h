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

typedef struct Sd2Module Sd2Module;

Sd2Module* sd2_create(const uint8_t* data, size_t size, float sample_rate);
void sd2_destroy(Sd2Module* module);

int sd2_subsong_count(const Sd2Module* module);
bool sd2_select_subsong(Sd2Module* module, int subsong);

int sd2_channel_count(const Sd2Module* module);
void sd2_set_channel_mask(Sd2Module* module, uint32_t mask);

size_t sd2_render(Sd2Module* module, float* interleaved_stereo, size_t frames);
bool sd2_has_ended(const Sd2Module* module);

// Track editing API
int sd2_get_num_tracks(const Sd2Module* module);
int sd2_get_track_length(const Sd2Module* module, int track_idx);
uint32_t sd2_get_cell(const Sd2Module* module, int track_idx, int row);
void sd2_set_cell(Sd2Module* module, int track_idx, int row,
                  int note, int instrument, int effect, int param);

// Instrument preview API
int sd2_get_instrument_count(const Sd2Module* module);
void sd2_preview_note_on(Sd2Module* module, int instrument, int note, int velocity);
void sd2_preview_note_off(Sd2Module* module);

// Serialize module to binary (caller must free *out_data)
uint32_t sd2_serialize(const Sd2Module* module, uint8_t** out_data);

#ifdef __cplusplus
}
#endif
