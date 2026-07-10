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

// Loop mode: 0 = one-shot (stop at end), 1 = loop (Amiga DMA reload default)
void paula_set_loop(int ch, int loop);

// Pre-load a follow-on buffer that kicks in when the current one-shot ends.
// Enables audio.device double-buffering (attack one-shot → sustain loop).
// period (0 = keep current) and vol (0-64) are applied atomically on the swap
// so the follow-on plays at its own pitch/level with no gap.
void paula_set_next(int ch, const int8_t* data, uint16_t len_words, int loop,
                    uint16_t period, uint8_t vol);

// Returns 1 if the channel's DMA is running, 0 if it stopped (one-shot ended).
int paula_is_active(int ch);

// One-shot DMA-completion signal. Set once each time a one-shot buffer reaches
// its end (whether it then swaps to the queued follow-on or stops). Mirrors the
// Amiga audio-block-done interrupt that audio.device uses to reply the finished
// IOAudio block and start the next queued write. Returns 1 and clears the flag
// if the channel completed a one-shot since the last poll, else 0.
int paula_poll_completion(int ch);

// Stop one channel's DMA and drop any queued follow-on buffer (audio.device
// disable_audio_dma, used by CMD_FLUSH note-off).
void paula_channel_dma_off(int ch);

// Reset all channels
void paula_reset(void);

// Configure clock (call before render; default: PAL)
void paula_set_clock(float paula_clock);

// Render frames of F32 stereo interleaved audio at PAULA_RATE_PAL
// Returns number of frames written
int paula_render(float* buffer, int frames);
