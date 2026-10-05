/*
 * stonetracker_wasm.c - exports for the StoneTracker worklet and tests
 *
 * st_wasm_load() takes the SPM song and the SPS sample bank (DeltaHuffman
 * packed or not) and starts song 1; st_wasm_render() writes interleaved
 * stereo float. See st_machine.c.
 */
#include <emscripten/emscripten.h>
#include <stdint.h>
#include "st_machine.h"

static int s_sampleRate = 48000;

EMSCRIPTEN_KEEPALIVE void st_wasm_init(int sampleRate) { if (sampleRate > 0) s_sampleRate = sampleRate; }

/* 0 ok; -1 bad arguments, -2 not an SPM module, -3 not an SPS bank or an
 * unsupported packing, -4 the player refused the module, -5 CPU crash. */
EMSCRIPTEN_KEEPALIVE int st_wasm_load(const uint8_t *spm, int spmLen, const uint8_t *sps, int spsLen) {
  if (spmLen <= 0 || spsLen <= 0) return -1;
  return st_machine_load(spm, (size_t)spmLen, sps, (size_t)spsLen, 1, s_sampleRate);
}

EMSCRIPTEN_KEEPALIVE int st_wasm_render(float *out, int frames) { return st_machine_render(out, frames); }
/* As st_wasm_render, plus 8 planar per-track buffers `stride` floats apart. */
EMSCRIPTEN_KEEPALIVE int st_wasm_render_channels(float *out, float *ch, int frames, int stride) {
  return st_machine_render_channels(out, ch, frames, stride);
}
EMSCRIPTEN_KEEPALIVE void st_wasm_set_mute_mask(int mask) { st_machine_set_mute_mask((uint32_t)mask); }
EMSCRIPTEN_KEEPALIVE void st_wasm_stop(void) { st_machine_stop(); }
EMSCRIPTEN_KEEPALIVE int st_wasm_get_position(void) { return st_machine_get_position(); }
EMSCRIPTEN_KEEPALIVE int st_wasm_get_line(void) { return st_machine_get_line(); }
EMSCRIPTEN_KEEPALIVE int st_wasm_crashed(void) { return st_machine_crashed(); }
