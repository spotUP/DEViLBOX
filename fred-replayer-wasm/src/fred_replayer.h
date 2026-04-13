// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct FredModule FredModule;

FredModule* fred_create(const uint8_t* data, size_t size, float sample_rate);
void fred_destroy(FredModule* module);

int fred_subsong_count(const FredModule* module);
bool fred_select_subsong(FredModule* module, int subsong);

int fred_channel_count(const FredModule* module);
void fred_set_channel_mask(FredModule* module, uint32_t mask);

size_t fred_render(FredModule* module, float* interleaved_stereo, size_t frames);
size_t fred_render_multi(FredModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool fred_has_ended(const FredModule* module);

// Edit API
int fred_get_instrument_count(const FredModule* module);
const char* fred_get_instrument_name(const FredModule* module, int inst);
float fred_get_instrument_param(const FredModule* module, int inst, const char* param);
void fred_set_instrument_param(FredModule* module, int inst, const char* param, float value);
size_t fred_export(const FredModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
