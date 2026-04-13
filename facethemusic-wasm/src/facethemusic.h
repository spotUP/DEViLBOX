// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct FtmModule FtmModule;

FtmModule* ftm_create(const uint8_t* data, size_t size, float sample_rate);
void ftm_destroy(FtmModule* module);

int ftm_subsong_count(const FtmModule* module);
bool ftm_select_subsong(FtmModule* module, int subsong);

int ftm_channel_count(const FtmModule* module);
void ftm_set_channel_mask(FtmModule* module, uint32_t mask);

size_t ftm_render(FtmModule* module, float* interleaved_stereo, size_t frames);
size_t ftm_render_multi(FtmModule* module, float** channel_buffers, int num_channels, size_t frames);

bool ftm_has_ended(const FtmModule* module);

#ifdef __cplusplus
}
#endif
