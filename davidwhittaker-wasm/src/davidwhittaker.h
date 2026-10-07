// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation (David Whittaker player)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct DwModule DwModule;

DwModule* dw_create(const uint8_t* data, size_t size, float sample_rate);
void dw_destroy(DwModule* module);

int dw_subsong_count(const DwModule* module);
bool dw_select_subsong(DwModule* module, int subsong);

int dw_channel_count(const DwModule* module);
void dw_set_channel_mask(DwModule* module, uint32_t mask);

size_t dw_render(DwModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dw_render_multi(DwModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dw_has_ended(const DwModule* module);

// Edit API
int dw_get_instrument_count(const DwModule* module);
float dw_get_instrument_param(const DwModule* module, int inst, const char* param);
void dw_set_instrument_param(DwModule* module, int inst, const char* param, float value);
size_t dw_export(const DwModule* module, uint8_t* out, size_t max_size);

// Keyboard preview: one note of one sample through the replayer's own track reader
void dw_preview_scan(DwModule* module);
int dw_preview_envelope(const DwModule* module, int sample);
int dw_preview_arpeggio(const DwModule* module, int sample);
bool dw_preview_note(DwModule* module, int sample, int note, int envelope, int arpeggio);
void dw_preview_stop(DwModule* module);

// What the replayer plays: (channel, sample index, track byte) of each note the subsong starts in `ticks` ticks
int dw_trace(DwModule* module, int ticks, int16_t* out, int max_notes);

// Every command the replayer executes (7 int32 per event: tick, channel, block file offset, byte position, kind, a, b)
int dw_walk(DwModule* module, int max_ticks, int32_t* out, int max_events, int32_t* info);


#ifdef __cplusplus
}
#endif
