// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct OktModule OktModule;

OktModule* okt_create(const uint8_t* data, size_t size, float sample_rate);
void okt_destroy(OktModule* module);

int okt_subsong_count(const OktModule* module);
bool okt_select_subsong(OktModule* module, int subsong);

int okt_channel_count(const OktModule* module);
void okt_set_channel_mask(OktModule* module, uint32_t mask);

size_t okt_render(OktModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch7 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t okt_render_multi(OktModule* module,
    float* ch0, float* ch1, float* ch2, float* ch3,
    float* ch4, float* ch5, float* ch6, float* ch7,
    size_t frames);

bool okt_has_ended(const OktModule* module);


