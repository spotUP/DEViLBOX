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


