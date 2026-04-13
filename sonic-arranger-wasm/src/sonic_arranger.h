// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SaModule SaModule;

SaModule* sa_create(const uint8_t* data, size_t size, float sample_rate);
void sa_destroy(SaModule* module);

int sa_subsong_count(const SaModule* module);
bool sa_select_subsong(SaModule* module, int subsong);

int sa_channel_count(const SaModule* module);
void sa_set_channel_mask(SaModule* module, uint32_t mask);

size_t sa_render(SaModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t sa_render_multi(SaModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sa_has_ended(const SaModule* module);

// ── Edit API ──────────────────────────────────────────────────────────────

// Pattern info
int sa_get_num_positions(const SaModule* module);
int sa_get_num_track_lines(const SaModule* module);
int sa_get_rows_per_track(const SaModule* module, int subsong);

// Pattern cell access (track_line_index is the flat index into track_lines[])
void sa_get_cell(const SaModule* module, int track_line_index,
                 uint8_t* note, uint8_t* instrument, uint8_t* arpeggio,
                 uint8_t* effect, uint8_t* effect_arg);
void sa_set_cell(SaModule* module, int track_line_index,
                 uint8_t note, uint8_t instrument, uint8_t arpeggio,
                 uint8_t effect, uint8_t effect_arg);

// Position info (4 channels per position)
void sa_get_position(const SaModule* module, int pos, int channel,
                     uint16_t* start_track_row, int8_t* sound_transpose, int8_t* note_transpose);
void sa_set_position(SaModule* module, int pos, int channel,
                     uint16_t start_track_row, int8_t sound_transpose, int8_t note_transpose);

// Instrument count and parameter access
int sa_get_instrument_count(const SaModule* module);
// Returns instrument parameter as float. Returns -1 if param not found.
// Param names: "type","waveformNumber","waveformLength","repeatLength","volume",
// "fineTuning","portamentoSpeed","vibratoDelay","vibratoSpeed","vibratoLevel",
// "amfNumber","amfDelay","amfLength","amfRepeat","adsrNumber","adsrDelay",
// "adsrLength","adsrRepeat","sustainPoint","sustainDelay","effect",
// "effectArg1","effectArg2","effectArg3","effectDelay"
float sa_get_instrument_param(const SaModule* module, int inst, const char* param);
void sa_set_instrument_param(SaModule* module, int inst, const char* param, float value);

// Instrument name
const char* sa_get_instrument_name(const SaModule* module, int inst);

// Export: serialize current state back to SOARV1.0 binary format.
// Returns bytes written, or 0 on failure. If out_buffer is NULL, returns required size.
size_t sa_export(const SaModule* module, uint8_t* out_buffer, size_t max_size);

#ifdef __cplusplus
}
#endif
