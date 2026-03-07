// paula_soft.h — Amiga Paula chip emulator
// Shared across all transpiled replayers.
// Output: F32 stereo interleaved @ PAULA_RATE_PAL Hz (28150 Hz)
#pragma once
#include <stdint.h>

#define PAULA_RATE_PAL   28150
#define PAULA_RATE_NTSC  28836
#define PAULA_CLOCK_PAL  3546895.0f
#define PAULA_CLOCK_NTSC 3579545.0f
#define PAULA_CHANNELS   4

// Called by transpiled replayer to set up channels
void paula_set_sample_ptr(int ch, const int8_t* data);
void paula_set_length(int ch, uint16_t len_words);
void paula_set_period(int ch, uint16_t period);
void paula_set_volume(int ch, uint8_t vol);       // 0-64
void paula_dma_write(uint16_t dmacon);            // $8xxx=enable, $0xxx=disable

// Reset all channels
void paula_reset(void);

// Configure clock (call before render; default: PAL)
void paula_set_clock(float paula_clock);

// Mixer: per-channel gain (0.0 = mute, 1.0 = unity). Applied on top of replayer volume.
void paula_set_channel_gain(int ch, float gain);

// Render frames of F32 stereo interleaved audio at PAULA_RATE_PAL
// Returns number of frames written
int paula_render(float* buffer, int frames);
