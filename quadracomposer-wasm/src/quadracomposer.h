// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct QcModule QcModule;

QcModule* qc_create(const uint8_t* data, size_t size, float sample_rate);
void qc_destroy(QcModule* module);

int qc_subsong_count(const QcModule* module);
bool qc_select_subsong(QcModule* module, int subsong);

int qc_channel_count(const QcModule* module);
void qc_set_channel_mask(QcModule* module, uint32_t mask);

size_t qc_render(QcModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t qc_render_multi(QcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool qc_has_ended(const QcModule* module);

// Edit API
int qc_get_instrument_count(const QcModule* module);
int qc_get_num_patterns(const QcModule* module);
int qc_get_pattern_rows(const QcModule* module, int pattern);
int qc_get_num_positions(const QcModule* module);

void qc_get_cell(const QcModule* module, int pattern, int row, int channel,
                  uint8_t* sample, int8_t* note, uint8_t* effect, uint8_t* effect_arg);
void qc_set_cell(QcModule* module, int pattern, int row, int channel,
                  uint8_t sample, int8_t note, uint8_t effect, uint8_t effect_arg);

float qc_get_instrument_param(const QcModule* module, int inst, const char* param);
void qc_set_instrument_param(QcModule* module, int inst, const char* param, float value);

size_t qc_export(const QcModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
