// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct GmcModule GmcModule;

GmcModule* gmc_create(const uint8_t* data, size_t size, float sample_rate);
void gmc_destroy(GmcModule* module);

int gmc_subsong_count(const GmcModule* module);
bool gmc_select_subsong(GmcModule* module, int subsong);

int gmc_channel_count(const GmcModule* module);
void gmc_set_channel_mask(GmcModule* module, uint32_t mask);

size_t gmc_render(GmcModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t gmc_render_multi(GmcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool gmc_has_ended(const GmcModule* module);

#ifdef __cplusplus
}
#endif
